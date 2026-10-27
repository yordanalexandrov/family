import type { ServerEvent } from '@family/shared';
import proposeInput from '@family/shared/fixtures/menu-propose.input.json' with {
  type: 'json',
};
import proposeFixture from '@family/shared/fixtures/menu-propose.valid.json' with {
  type: 'json',
};
import { eq, sql } from 'drizzle-orm';
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
  vi,
} from 'vitest';
import { ingredient, recipe, recipeIngredient } from '../db/schema/food.js';
import { mealVote } from '../db/schema/menu.js';
import { buildTestApp } from '../test/app.js';
import { testDb } from '../test/db.js';
import {
  CHAT_COMPLETIONS_URL,
  completion,
  openclaw,
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
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
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

function patchMeal(id: string, payload: object, as = DANI.id) {
  return app.inject({
    method: 'PATCH',
    url: `/api/menu/meals/${id}`,
    headers: { 'x-acting-user': as },
    payload,
  });
}

/** `PUT` the vote of `as` for a meal, or `DELETE` it with `value` null. */
function vote(id: string, value: 'up' | 'down' | null, as = DANI.id) {
  return app.inject({
    method: value === null ? 'DELETE' : 'PUT',
    url: `/api/menu/meals/${id}/vote`,
    headers: { 'x-acting-user': as },
    ...(value === null ? {} : { payload: { value } }),
  });
}

/** The week of `NOW` (Wednesday 28 October): Monday 26 and Tuesday 27 are past days. */
const THIS_WEEK = '2026-10-26';

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

  it('takes the week once when an empty plan and a proposal are asked for at the same time', async () => {
    for (let round = 0; round < 5; round++) {
      const [plan, proposal] = await Promise.all([
        inject('POST', '/api/menu/plans', { weekStart: WEEK }),
        inject('POST', '/api/menu/proposals', { weekStart: WEEK }),
      ]);

      const statuses = [plan.statusCode, proposal.statusCode];
      expect(statuses).toContain(409);
      if (proposal.statusCode === 202) {
        expect(plan.statusCode).toBe(409);
        // The run makes the plan; no empty plan slipped in before it.
        expect(await finished(proposal.json().proposal.id)).toMatchObject({
          status: 'done',
        });
      } else {
        expect(plan.statusCode).toBe(201);
      }
      const { plan: taken } = (await getPlan(WEEK)).json();
      expect(
        (await inject('DELETE', `/api/menu/plans/${taken.id}`)).statusCode,
      ).toBe(204);
    }
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

describe('menu without an acting user (kiosk)', () => {
  it('reads the plan, but refuses to change it', async () => {
    const plan = await createPlan(WEEK);

    const read = await app.inject({
      method: 'GET',
      url: `/api/menu/plans?weekStart=${WEEK}`,
    });
    const meal = plan.meals[0];
    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/menu/meals/${meal.id}`,
      payload: { note: 'ядем навън' },
    });

    expect(read.statusCode).toBe(200);
    expect(read.json()).toEqual({ plan });
    expect(patch.statusCode).toBe(400);
    expect(patch.json()).toMatchObject({ error: 'missing_acting_user' });
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
      votes: [{ userId: DANI.id, value: 'up' }],
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

  it('answers 400 for a recipe without the dinner tag, unless the meal keeps the recipe it has', async () => {
    const plan = await proposedPlan();
    const [monday, tuesday] = plan.meals;
    const db = testDb();
    const [lunchOnly] = await db
      .insert(recipe)
      .values({
        title: 'Супа',
        servings: 4,
        steps: ['Свари.'],
        tags: ['lunch'],
      })
      .returning({ id: recipe.id });
    // A recipe of the plan that lost its dinner tag later.
    await db
      .update(recipe)
      .set({ tags: [] })
      .where(eq(recipe.id, tuesday.recipeId));

    const notDinner = await patchMeal(monday.id, { recipeId: lunchOnly?.id });
    const kept = await patchMeal(tuesday.id, {
      recipeId: tuesday.recipeId,
      cookUserId: POLI.id,
    });

    expect(notDinner.statusCode).toBe(400);
    expect(notDinner.json()).toMatchObject({ error: 'invalid_reference' });
    expect((await getPlan(WEEK)).json().plan.meals[0]).toEqual(monday);
    expect(kept.statusCode).toBe(200);
    expect(kept.json().meal).toMatchObject({
      recipeId: tuesday.recipeId,
      cookUserId: POLI.id,
    });
  });

  it('bumps the plan’s updatedAt to the time of the change', async () => {
    const plan = await createPlan(WEEK);
    clock = new Date('2026-10-29T15:30:00Z');

    await patchMeal(plan.meals[0].id, { note: 'навън' });

    expect((await getPlan(WEEK)).json().plan.updatedAt).toBe(
      '2026-10-29T15:30:00.000Z',
    );
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

describe('votes', () => {
  it('puts, changes and takes back the acting user’s vote, and returns the meal with all votes', async () => {
    const plan = await createPlan(WEEK);
    const [monday] = plan.meals;
    expect(monday.votes).toEqual([]);

    const up = await vote(monday.id, 'up');
    const poli = await vote(monday.id, 'down', POLI.id);
    const changed = await vote(monday.id, 'down');
    const back = await vote(monday.id, null, POLI.id);

    expect(up.statusCode).toBe(200);
    expect(up.json().meal).toMatchObject({
      id: monday.id,
      votes: [{ userId: DANI.id, value: 'up' }],
    });
    expect(poli.json().meal.votes).toEqual([
      { userId: DANI.id, value: 'up' },
      { userId: POLI.id, value: 'down' },
    ]);
    expect(changed.json().meal.votes).toEqual([
      { userId: DANI.id, value: 'down' },
      { userId: POLI.id, value: 'down' },
    ]);
    expect(back.statusCode).toBe(200);
    expect(back.json().meal.votes).toEqual([
      { userId: DANI.id, value: 'down' },
    ]);
    expect((await getPlan(WEEK)).json().plan.meals[0].votes).toEqual([
      { userId: DANI.id, value: 'down' },
    ]);
  });

  it('taking back a vote that is not there leaves the meal as it is', async () => {
    const plan = await createPlan(WEEK);

    const response = await vote(plan.meals[0].id, null);

    expect(response.statusCode).toBe(200);
    expect(response.json().meal.votes).toEqual([]);
  });

  it('answers 400 for a value that is neither up nor down, and 404 for an unknown meal', async () => {
    const plan = await createPlan(WEEK);

    const bad = await inject(
      'PUT',
      `/api/menu/meals/${plan.meals[0].id}/vote`,
      { value: 'maybe' },
    );
    const unknown = await vote('99999999-9999-4999-8999-999999999999', 'up');

    expect(bad.statusCode).toBe(400);
    expect(unknown.statusCode).toBe(404);
  });

  it('refuses a vote without an acting user (kiosk)', async () => {
    const plan = await createPlan(WEEK);

    const response = await app.inject({
      method: 'PUT',
      url: `/api/menu/meals/${plan.meals[0].id}/vote`,
      payload: { value: 'up' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'missing_acting_user' });
  });

  it('answers 409 past_meal for a vote on a day before today (Sofia), and keeps the votes', async () => {
    // Tuesday 27 October, 10:00 in Sofia.
    clock = new Date('2026-10-27T08:00:00Z');
    const plan = await createPlan(THIS_WEEK);
    const [monday, tuesday, wednesday] = plan.meals;
    await vote(tuesday.id, 'up');
    // Wednesday 28 October, 00:30 in Sofia: Tuesday is now past.
    clock = new Date('2026-10-27T22:30:00Z');

    const put = await vote(monday.id, 'up');
    const taken = await vote(tuesday.id, null);
    const today = await vote(wednesday.id, 'up');

    expect(put.statusCode).toBe(409);
    expect(put.json()).toMatchObject({ error: 'conflict', code: 'past_meal' });
    expect(taken.statusCode).toBe(409);
    expect(today.statusCode).toBe(200);
    expect((await getPlan(THIS_WEEK)).json().plan.meals[1].votes).toEqual([
      { userId: DANI.id, value: 'up' },
    ]);
  });

  it('signals menu.changed and shopping.changed for the week of the meal', async () => {
    const plan = await createPlan(WEEK);
    const signals: ServerEvent[] = [];
    const unsubscribe = app.events.subscribe((event) => signals.push(event));

    await vote(plan.meals[0].id, 'up');
    await vote(plan.meals[0].id, null);
    unsubscribe();

    expect(signals).toEqual([
      { type: 'menu.changed', weekStart: WEEK },
      { type: 'shopping.changed', weekStart: WEEK },
      { type: 'menu.changed', weekStart: WEEK },
      { type: 'shopping.changed', weekStart: WEEK },
    ]);
  });

  it('a new recipe or note drops the other’s vote and makes the one who changed it up', async () => {
    const plan = await proposedPlan();
    const [monday, tuesday] = plan.meals;
    for (const meal of [monday, tuesday]) {
      await vote(meal.id, 'down');
      await vote(meal.id, 'up', POLI.id);
    }

    const recipe = await patchMeal(
      monday.id,
      { recipeId: recipeId(9) },
      POLI.id,
    );
    const note = await patchMeal(tuesday.id, { note: 'двойна порция' });

    expect(recipe.json().meal.votes).toEqual([
      { userId: POLI.id, value: 'up' },
    ]);
    expect(note.json().meal.votes).toEqual([{ userId: DANI.id, value: 'up' }]);
  });

  it('the cook, the servings and an unchanged recipe leave the votes as they are', async () => {
    const plan = await proposedPlan();
    const [monday] = plan.meals;
    await vote(monday.id, 'down');
    await vote(monday.id, 'down', POLI.id);

    const response = await patchMeal(
      monday.id,
      {
        recipeId: monday.recipeId,
        note: monday.note,
        cookUserId: POLI.id,
        servings: { [DANI.id]: 2, [POLI.id]: 1 },
      },
      POLI.id,
    );

    expect(response.json().meal.votes).toEqual([
      { userId: DANI.id, value: 'down' },
      { userId: POLI.id, value: 'down' },
    ]);
  });

  it('a past meal keeps its recipe and note (409 past_meal), but its cook and servings can still change', async () => {
    const plan = await createPlan(THIS_WEEK);
    const [monday] = plan.meals;

    const recipe = await patchMeal(monday.id, { recipeId: recipeId(5) });
    const note = await patchMeal(monday.id, { note: 'навън' });
    const cook = await patchMeal(monday.id, {
      cookUserId: POLI.id,
      servings: { [DANI.id]: 0, [POLI.id]: 1 },
    });

    expect(recipe.statusCode).toBe(409);
    expect(recipe.json()).toMatchObject({ code: 'past_meal' });
    expect(note.statusCode).toBe(409);
    expect(cook.statusCode).toBe(200);
    expect(cook.json().meal).toMatchObject({
      recipeId: null,
      note: null,
      cookUserId: POLI.id,
      votes: [],
    });
  });

  it('go with the plan when it is deleted', async () => {
    const plan = await createPlan(WEEK);
    await vote(plan.meals[0].id, 'up');
    await vote(plan.meals[1].id, 'down', POLI.id);

    const response = await inject('DELETE', `/api/menu/plans/${plan.id}`);

    expect(response.statusCode).toBe(204);
    expect(await testDb().select().from(mealVote)).toEqual([]);
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

  it('signals menu.changed and shopping.changed for the week once the proposed plan is made', async () => {
    const signals: ServerEvent[] = [];
    const unsubscribe = app.events.subscribe((event) => signals.push(event));

    const proposal = await propose({ weekStart: WEEK });
    expect(signals).toEqual([]);
    await finished(proposal.id);

    await vi.waitFor(() =>
      expect(signals).toEqual([
        { type: 'menu.changed', weekStart: WEEK },
        { type: 'shopping.changed', weekStart: WEEK },
      ]),
    );
    unsubscribe();
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
    // The past weeks were planned before they began: their recipes cannot change once the days are past.
    clock = new Date('2026-10-01T08:00:00Z');
    const threeWeeksBack = await createPlan('2026-10-12');
    await patchMeal(threeWeeksBack.meals[0].id, { recipeId: recipeId(1) });
    const twoWeeksBack = await createPlan('2026-10-19');
    await patchMeal(twoWeeksBack.meals[2].id, { recipeId: recipeId(7) });
    const lastWeek = await createPlan('2026-10-26');
    await patchMeal(lastWeek.meals[0].id, { recipeId: recipeId(4) });
    await patchMeal(lastWeek.meals[1].id, { note: 'ядем навън' });
    clock = NOW;

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
});

describe('GET /api/menu/proposals/:id', () => {
  it('answers 404 for an unknown proposal', async () => {
    const response = await inject(
      'GET',
      '/api/menu/proposals/99999999-9999-4999-8999-999999999999',
    );

    expect(response.statusCode).toBe(404);
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

  it('is today’s recipe, its id and its cook', async () => {
    const plan = await createPlan(WEEK);
    await patchMeal(plan.meals[1].id, {
      recipeId: recipeId(2),
      cookUserId: POLI.id,
    });

    expect(await cooking()).toEqual({
      lunch: null,
      dinner: {
        title: 'Леща яхния',
        recipeId: recipeId(2),
        cookUserId: POLI.id,
        servings: { [DANI.id]: 1, [POLI.id]: 1 },
      },
    });
  });

  it('carries the servings of today’s dinner (guests)', async () => {
    const plan = await createPlan(WEEK);
    await patchMeal(plan.meals[1].id, {
      recipeId: recipeId(2),
      servings: { [DANI.id]: 2, [POLI.id]: 2 },
    });

    expect((await cooking()).dinner.servings).toEqual({
      [DANI.id]: 2,
      [POLI.id]: 2,
    });
  });

  it('is the note of a meal without a recipe, with no cook', async () => {
    const plan = await createPlan(WEEK);
    await patchMeal(plan.meals[1].id, { note: 'ядем навън' });

    expect(await cooking()).toEqual({
      lunch: null,
      dinner: {
        title: 'ядем навън',
        recipeId: null,
        cookUserId: null,
        servings: { [DANI.id]: 1, [POLI.id]: 1 },
      },
    });
  });

  it('is null without a plan for today or for an empty meal', async () => {
    expect(await cooking()).toEqual({ lunch: null, dinner: null });

    await createPlan(WEEK);

    expect(await cooking()).toEqual({ lunch: null, dinner: null });
  });
});
