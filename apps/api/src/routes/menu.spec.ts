import proposeInput from '@family/shared/fixtures/menu-propose.input.json' with {
  type: 'json',
};
import proposeFixture from '@family/shared/fixtures/menu-propose.valid.json' with {
  type: 'json',
};
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { HttpResponse, http } from 'msw';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { ingredient, recipe, recipeIngredient } from '../db/schema/food.js';
import { menuProposalRequest } from '../db/schema/menu.js';
import { buildTestApp } from '../test/app.js';
import { testDb } from '../test/db.js';
import {
  CHAT_COMPLETIONS_URL,
  completion,
  openclaw,
  TEST_OPENCLAW,
} from '../test/openclaw.js';
import { DANI, POLI } from '../test/users.js';

/** Wednesday 28 October 2026, 10:00 in Sofia: the week of 2 November has not begun. */
const NOW = new Date('2026-10-28T08:00:00Z');
/** The week of the recorded `menu.propose` fixture. */
const WEEK = proposeInput.weekStart;

let clock = NOW;
let app: FastifyInstance;

beforeAll(async () => {
  openclaw.listen({ onUnhandledFrame: 'error' });
  app = buildTestApp({ now: () => clock });
  await app.ready();
});

beforeEach(async () => {
  clock = NOW;
  await seedFixtureRecipes();
  answerInTurn(JSON.stringify(proposeFixture));
});

afterEach(() => openclaw.resetHandlers());

afterAll(async () => {
  await app.close();
  openclaw.close();
});

const headers = { 'x-acting-user': DANI.id };

/**
 * The registry the recorded fixture was made for: the 10 dinner recipes of `menu-propose.input.json`, with their ids,
 * so the recorded answer passes `validateProposal` as it is. Products the seed lacks are added.
 */
async function seedFixtureRecipes() {
  const db = testDb();
  for (const entry of proposeInput.recipes) {
    await db.insert(recipe).values({
      id: entry.id,
      title: entry.title,
      servings: 4,
      steps: ['Сготви.'],
      prepMinutes: entry.prepMinutes,
      tags: entry.tags as (typeof recipe.$inferInsert)['tags'],
    });
    for (const [position, name] of entry.ingredientNames.entries()) {
      await db
        .insert(ingredient)
        .values({ name, unit: 'g', aisle: 'other' })
        .onConflictDoNothing();
      const [row] = await db
        .select({ id: ingredient.id })
        .from(ingredient)
        .where(sql`lower(${ingredient.name}) = ${name}`);
      await db.insert(recipeIngredient).values({
        recipeId: entry.id,
        ingredientId: row?.id ?? '',
        position,
        quantity: '100',
        unit: 'g',
      });
    }
  }
}

function inject(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
  target = app,
) {
  return target.inject({ method, url, headers, payload });
}

/** The recorded `menu.propose` answer, cloned so a spec can break it. */
function fixture(): typeof proposeFixture {
  return structuredClone(proposeFixture);
}

/** Answers the chat completions in turn with `contents` (the last one from then on); returns the request bodies. */
function answerInTurn(...contents: string[]) {
  const bodies: {
    model: string;
    messages: { role: string; content: string }[];
    response_format: { json_schema: { name: string } };
  }[] = [];
  openclaw.use(
    http.post(CHAT_COMPLETIONS_URL, async ({ request }) => {
      bodies.push((await request.json()) as (typeof bodies)[number]);
      const content = contents[bodies.length - 1] ?? contents.at(-1) ?? '';
      return HttpResponse.json(completion(content));
    }),
  );
  return bodies;
}

async function createPlan(weekStart: string) {
  const response = await inject('POST', '/api/menu/plans', { weekStart });
  expect(response.statusCode).toBe(201);
  return response.json().plan;
}

function getPlan(weekStart: string) {
  return inject('GET', `/api/menu/plans?weekStart=${weekStart}`);
}

function patchMeal(id: string, payload: object) {
  return inject('PATCH', `/api/menu/meals/${id}`, payload);
}

async function propose(payload: object, target = app) {
  const response = await inject('POST', '/api/menu/proposals', payload, target);
  expect(response.statusCode).toBe(202);
  return response.json().proposal;
}

/** Polls `GET /api/menu/proposals/:id` until the background run has finished. */
async function finished(id: string, target = app, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const response = await inject(
      'GET',
      `/api/menu/proposals/${id}`,
      undefined,
      target,
    );
    expect(response.statusCode).toBe(200);
    const { proposal } = response.json();
    if (proposal.status !== 'pending') {
      return proposal;
    }
    if (Date.now() > deadline) {
      throw new Error(`proposal ${id} still pending`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** A plan for the fixture's week the way the agent made it. */
async function proposedPlan() {
  const proposal = await propose({ weekStart: WEEK });
  expect(await finished(proposal.id)).toMatchObject({ status: 'done' });
  return (await getPlan(WEEK)).json().plan;
}

/** One proposed dinner of an answer. */
function day(date: string, recipe: string) {
  return { date, slot: 'dinner', recipeId: recipe, why: 'Защото.' };
}

/** Id of recipe `n` of the fixture registry. */
function recipeId(n: number) {
  return `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

describe('POST /api/menu/plans', () => {
  it('creates an empty plan: 7 dinners without a recipe, one serving for each user', async () => {
    const created = await inject('POST', '/api/menu/plans', {
      weekStart: WEEK,
    });

    expect(created.statusCode).toBe(201);
    const { plan } = created.json();
    expect(plan).toMatchObject({
      weekStart: WEEK,
      summary: null,
      createdBy: DANI.id,
    });
    expect(plan.meals.map((m: { date: string }) => m.date)).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
    ]);
    for (const meal of plan.meals) {
      expect(meal).toMatchObject({
        planId: plan.id,
        slot: 'dinner',
        recipeId: null,
        recipe: null,
        note: null,
        cookUserId: null,
        why: null,
        servings: { [DANI.id]: 1, [POLI.id]: 1 },
      });
    }

    const read = await inject('GET', `/api/menu/plans?weekStart=${WEEK}`);
    expect(read.statusCode).toBe(200);
    expect(read.json()).toEqual({ plan });
  });
});

describe('POST /api/menu/plans refusals', () => {
  it('answers 409 when the week already has a plan', async () => {
    await createPlan(WEEK);

    const again = await inject('POST', '/api/menu/plans', { weekStart: WEEK });

    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ error: 'conflict' });
  });

  it('answers 409 while a proposal for the week is pending', async () => {
    let release = () => {};
    openclaw.use(
      http.post(CHAT_COMPLETIONS_URL, async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return HttpResponse.json(completion(JSON.stringify(fixture())));
      }),
    );
    const proposal = await propose({ weekStart: WEEK });

    const created = await inject('POST', '/api/menu/plans', {
      weekStart: WEEK,
    });

    expect(created.statusCode).toBe(409);
    release();
    await finished(proposal.id);
  });

  it('answers 400 for a week that does not start on Monday', async () => {
    const response = await inject('POST', '/api/menu/plans', {
      weekStart: '2026-11-03',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'validation_error' });
  });
});

describe('GET /api/menu/plans', () => {
  it('answers 404 for a week without a plan', async () => {
    const response = await getPlan(WEEK);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: 'not_found' });
  });

  it('lists the plans whose week starts between from and to, without meals, oldest first', async () => {
    await createPlan('2026-10-12');
    const first = await createPlan('2026-10-19');
    const second = await createPlan('2026-10-26');
    await createPlan(WEEK);

    const response = await inject(
      'GET',
      '/api/menu/plans?from=2026-10-19&to=2026-10-26',
    );

    expect(response.statusCode).toBe(200);
    const { meals: _first, ...firstSummary } = first;
    const { meals: _second, ...secondSummary } = second;
    expect(response.json()).toEqual({ plans: [firstSummary, secondSummary] });
  });
});

describe('PATCH /api/menu/meals/:id', () => {
  it('sets the recipe, the cook, the servings and a note, and returns the meal with its recipe', async () => {
    const plan = await createPlan(WEEK);
    const [monday] = plan.meals;

    const response = await patchMeal(monday.id, {
      recipeId: recipeId(5),
      cookUserId: POLI.id,
      servings: { [DANI.id]: 2, [POLI.id]: 0 },
      note: '  с двойна порция  ',
    });

    expect(response.statusCode).toBe(200);
    const expected = {
      ...monday,
      recipeId: recipeId(5),
      recipe: { title: 'Мусака', archivedAt: null },
      cookUserId: POLI.id,
      servings: { [DANI.id]: 2, [POLI.id]: 0 },
      note: 'с двойна порция',
    };
    expect(response.json()).toEqual({ meal: expected });
    expect((await getPlan(WEEK)).json().plan.meals[0]).toEqual(expected);
  });

  it('clears the agent’s why when the recipe is changed by hand, and keeps it otherwise', async () => {
    const plan = await proposedPlan();
    const [monday, tuesday] = plan.meals;
    expect(monday.why).toEqual(expect.any(String));

    const changed = await patchMeal(monday.id, { recipeId: recipeId(9) });
    const cookOnly = await patchMeal(tuesday.id, {
      recipeId: tuesday.recipeId,
      cookUserId: DANI.id,
    });

    expect(changed.json().meal).toMatchObject({
      recipeId: recipeId(9),
      why: null,
    });
    expect(cookOnly.json().meal).toMatchObject({
      recipeId: tuesday.recipeId,
      cookUserId: DANI.id,
      why: tuesday.why,
    });
  });

  it('empties a meal: no recipe and a blank note', async () => {
    const plan = await proposedPlan();

    const response = await patchMeal(plan.meals[0].id, {
      recipeId: null,
      note: '   ',
    });

    expect(response.json().meal).toMatchObject({
      recipeId: null,
      recipe: null,
      note: null,
      why: null,
    });
  });

  it('answers 400 for an archived or unknown recipe, and leaves the meal as it was', async () => {
    const plan = await createPlan(WEEK);
    const [monday] = plan.meals;
    await inject('POST', `/api/recipes/${recipeId(5)}/archive`);

    const archived = await patchMeal(monday.id, { recipeId: recipeId(5) });
    const unknown = await patchMeal(monday.id, {
      recipeId: '99999999-9999-4999-8999-999999999999',
    });

    expect(archived.statusCode).toBe(400);
    expect(archived.json()).toMatchObject({ error: 'invalid_reference' });
    expect(unknown.statusCode).toBe(400);
    expect((await getPlan(WEEK)).json().plan.meals[0]).toEqual(monday);
  });

  it('keeps showing a recipe that was archived after it was planned', async () => {
    const plan = await proposedPlan();
    const [monday] = plan.meals;
    await inject('POST', `/api/recipes/${monday.recipeId}/archive`);

    const meal = (await getPlan(WEEK)).json().plan.meals[0];

    expect(meal.recipeId).toBe(monday.recipeId);
    expect(meal.recipe).toEqual({
      title: monday.recipe.title,
      archivedAt: expect.any(String),
    });
  });

  it('answers 400 for a cook or servings of an unknown user', async () => {
    const plan = await createPlan(WEEK);
    const stranger = '99999999-9999-4999-8999-999999999999';

    const cook = await patchMeal(plan.meals[0].id, { cookUserId: stranger });
    const servings = await patchMeal(plan.meals[0].id, {
      servings: { [stranger]: 1 },
    });

    expect(cook.statusCode).toBe(400);
    expect(cook.json()).toMatchObject({ error: 'invalid_reference' });
    expect(servings.statusCode).toBe(400);
  });

  it('answers 404 for an unknown meal', async () => {
    const response = await patchMeal('99999999-9999-4999-8999-999999999999', {
      note: 'навън',
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('DELETE /api/menu/plans/:id', () => {
  it('deletes a plan whose week has not begun', async () => {
    const plan = await createPlan(WEEK);
    // Sunday 1 November, 23:59 in Sofia.
    clock = new Date('2026-11-01T21:59:00Z');

    const response = await inject('DELETE', `/api/menu/plans/${plan.id}`);

    expect(response.statusCode).toBe(204);
    expect((await getPlan(WEEK)).statusCode).toBe(404);
  });

  it('answers 409 once the week has begun (Monday 00:00 in Sofia)', async () => {
    const plan = await createPlan(WEEK);
    // Monday 2 November, 00:00 in Sofia.
    clock = new Date('2026-11-01T22:00:00Z');

    const response = await inject('DELETE', `/api/menu/plans/${plan.id}`);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'conflict' });
    expect((await getPlan(WEEK)).statusCode).toBe(200);
  });

  it('answers 404 for an unknown plan', async () => {
    const response = await inject(
      'DELETE',
      '/api/menu/plans/99999999-9999-4999-8999-999999999999',
    );

    expect(response.statusCode).toBe(404);
  });
});

describe('POST /api/menu/proposals', () => {
  it('answers 202 with a pending proposal, then makes the plan from the agent’s answer', async () => {
    const proposal = await propose({ weekStart: WEEK, hint: 'повече риба' });
    expect(proposal).toMatchObject({
      weekStart: WEEK,
      hint: 'повече риба',
      status: 'pending',
      requestedBy: DANI.id,
    });

    const done = await finished(proposal.id);

    expect(done).toMatchObject({ status: 'done', planId: expect.any(String) });
    expect(done.finishedAt).toEqual(expect.any(String));
    const { plan } = (await getPlan(WEEK)).json();
    expect(plan).toMatchObject({
      id: done.planId,
      summary: proposeFixture.summary,
      createdBy: DANI.id,
    });
    expect(
      plan.meals.map((m: { date: string; recipeId: string; why: string }) => ({
        date: m.date,
        slot: 'dinner',
        recipeId: m.recipeId,
        why: m.why,
      })),
    ).toEqual(proposeFixture.days);
    for (const meal of plan.meals) {
      expect(meal).toMatchObject({
        cookUserId: null,
        note: null,
        servings: { [DANI.id]: 1, [POLI.id]: 1 },
        recipe: { title: expect.any(String), archivedAt: null },
      });
    }
  });

  it('sends the agent the dinner registry and the recipes of the 2 previous weeks', async () => {
    const bodies = answerInTurn(JSON.stringify(fixture()));
    // Lunch only and archived: not to choose from.
    await testDb()
      .insert(recipe)
      .values([
        { title: 'Таратор', servings: 2, steps: ['Смеси.'], tags: ['lunch'] },
        {
          title: 'Стара вечеря',
          servings: 2,
          steps: ['Сготви.'],
          tags: ['dinner'],
          archivedAt: new Date(),
        },
      ]);
    const threeWeeksBack = await createPlan('2026-10-12');
    await patchMeal(threeWeeksBack.meals[0].id, { recipeId: recipeId(1) });
    const twoWeeksBack = await createPlan('2026-10-19');
    await patchMeal(twoWeeksBack.meals[2].id, { recipeId: recipeId(7) });
    const lastWeek = await createPlan('2026-10-26');
    await patchMeal(lastWeek.meals[0].id, { recipeId: recipeId(4) });
    await patchMeal(lastWeek.meals[1].id, { note: 'ядем навън' });

    const proposal = await propose({
      weekStart: WEEK,
      hint: proposeInput.hint,
    });
    await finished(proposal.id);

    expect(bodies).toHaveLength(1);
    const [body] = bodies;
    expect(body?.model).toBe('openclaw/family-menu');
    expect(body?.response_format.json_schema.name).toBe('menu_propose');
    const input = JSON.parse(body?.messages[0]?.content ?? '');
    const byId = (a: { id: string }, b: { id: string }) =>
      a.id.localeCompare(b.id);
    expect({ ...input, recipes: input.recipes.sort(byId) }).toEqual({
      ...proposeInput,
      recipes: [...proposeInput.recipes].sort(byId),
    });
  });

  it('retries once with the problems when the answer breaks the rules, then makes the plan', async () => {
    const repeated = fixture();
    repeated.days[0] = day('2026-11-02', recipeId(3));
    repeated.days[1] = day('2026-11-03', recipeId(3));
    const bodies = answerInTurn(
      JSON.stringify(repeated),
      JSON.stringify(fixture()),
    );

    const proposal = await propose({ weekStart: WEEK });

    expect(await finished(proposal.id)).toMatchObject({ status: 'done' });
    expect(bodies).toHaveLength(2);
    const retry = bodies[1]?.messages.at(-1)?.content;
    expect(retry).toContain('Отговорът не мина валидация');
    expect(retry).toContain('вече е в седмицата');
  });

  it('fails as invalid_output when the retry is invalid too, and makes no plan', async () => {
    const sixDays = fixture();
    sixDays.days.pop();
    const outside = fixture();
    outside.days[6] = day('2026-11-09', recipeId(9));
    const bodies = answerInTurn(
      JSON.stringify(sixDays),
      JSON.stringify(outside),
    );

    const proposal = await propose({ weekStart: WEEK });

    expect(await finished(proposal.id)).toMatchObject({
      status: 'failed',
      error: 'invalid_output',
    });
    expect(bodies).toHaveLength(2);
    expect((await getPlan(WEEK)).statusCode).toBe(404);
    // The week is free again: a new proposal or an empty plan can be made.
    await createPlan(WEEK);
  });

  it('answers 409 not_enough_recipes with fewer than 7 dinner recipes that are not archived', async () => {
    for (const n of [1, 2, 3, 4]) {
      await inject('POST', `/api/recipes/${recipeId(n)}/archive`);
    }

    const response = await inject('POST', '/api/menu/proposals', {
      weekStart: WEEK,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: 'conflict',
      code: 'not_enough_recipes',
      have: 6,
      need: 7,
    });
  });

  it('answers 409 when the week has a plan or a pending proposal', async () => {
    await createPlan('2026-11-09');
    let release = () => {};
    openclaw.use(
      http.post(CHAT_COMPLETIONS_URL, async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return HttpResponse.json(completion('{}'));
      }),
    );
    const pending = await propose({ weekStart: WEEK });

    const withPlan = await inject('POST', '/api/menu/proposals', {
      weekStart: '2026-11-09',
    });
    const twice = await inject('POST', '/api/menu/proposals', {
      weekStart: WEEK,
    });

    expect(withPlan.statusCode).toBe(409);
    expect(twice.statusCode).toBe(409);
    expect(twice.json()).toMatchObject({ error: 'conflict' });
    release();
    await finished(pending.id);
  });

  it('answers 503 openclaw_unavailable when OpenClaw is not configured', async () => {
    const disabled = buildTestApp({ openclaw: undefined, now: () => clock });
    try {
      const response = await inject(
        'POST',
        '/api/menu/proposals',
        { weekStart: WEEK },
        disabled,
      );

      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ error: 'openclaw_unavailable' });
    } finally {
      await disabled.close();
    }
  });

  it('fails as timeout when the agent does not answer in time', async () => {
    const slow = buildTestApp({
      openclaw: { ...TEST_OPENCLAW, timeoutMs: 100 },
      now: () => clock,
    });
    openclaw.use(
      http.post(CHAT_COMPLETIONS_URL, async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return HttpResponse.json(completion(JSON.stringify(fixture())));
      }),
    );
    try {
      const proposal = await propose({ weekStart: WEEK }, slow);

      expect(await finished(proposal.id, slow)).toMatchObject({
        status: 'failed',
        error: 'timeout',
      });
    } finally {
      await slow.close();
    }
  });
});

describe('GET /api/menu/proposals/:id', () => {
  it('answers 404 for an unknown proposal', async () => {
    const response = await inject(
      'GET',
      '/api/menu/proposals/99999999-9999-4999-8999-999999999999',
    );

    expect(response.statusCode).toBe(404);
  });

  it('fails pending proposals older than 10 minutes as stale at start, and leaves younger ones pending', async () => {
    const [old, young] = await testDb()
      .insert(menuProposalRequest)
      .values([
        {
          weekStart: '2026-11-09',
          requestedBy: DANI.id,
          createdAt: new Date(Date.now() - 11 * 60 * 1000),
        },
        {
          weekStart: '2026-11-16',
          requestedBy: DANI.id,
          createdAt: new Date(Date.now() - 60 * 1000),
        },
      ])
      .returning({ id: menuProposalRequest.id });

    const restarted = buildTestApp({ now: () => clock });
    await restarted.ready();
    try {
      const stale = await inject(
        'GET',
        `/api/menu/proposals/${old?.id}`,
        undefined,
        restarted,
      );
      const pending = await inject(
        'GET',
        `/api/menu/proposals/${young?.id}`,
        undefined,
        restarted,
      );

      expect(stale.json().proposal).toMatchObject({
        status: 'failed',
        error: 'stale',
        finishedAt: expect.any(String),
      });
      expect(pending.json().proposal.status).toBe('pending');
    } finally {
      await restarted.close();
    }
  });
});

describe('cooking.dinner in GET /api/dashboard', () => {
  /** Tuesday 3 November 2026, 21:30 in Sofia: today's dinner shows all day. */
  const TUESDAY_EVENING = new Date('2026-11-03T19:30:00Z');

  async function cooking() {
    clock = TUESDAY_EVENING;
    const response = await app.inject({ method: 'GET', url: '/api/dashboard' });
    expect(response.statusCode).toBe(200);
    return response.json().cooking;
  }

  it('is today’s recipe and its cook', async () => {
    const plan = await createPlan(WEEK);
    await patchMeal(plan.meals[1].id, {
      recipeId: recipeId(2),
      cookUserId: POLI.id,
    });

    expect(await cooking()).toEqual({
      lunch: null,
      dinner: { title: 'Леща яхния', cookUserId: POLI.id },
    });
  });

  it('is the note of a meal without a recipe, with no cook', async () => {
    const plan = await createPlan(WEEK);
    await patchMeal(plan.meals[1].id, { note: 'ядем навън' });

    expect(await cooking()).toEqual({
      lunch: null,
      dinner: { title: 'ядем навън', cookUserId: null },
    });
  });

  it('is null without a plan for today or for an empty meal', async () => {
    expect(await cooking()).toEqual({ lunch: null, dinner: null });

    await createPlan(WEEK);

    expect(await cooking()).toEqual({ lunch: null, dinner: null });
  });
});
