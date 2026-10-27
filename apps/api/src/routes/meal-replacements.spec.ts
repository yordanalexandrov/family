import replaceInput from '@family/shared/fixtures/meal-replace.input.json' with {
  type: 'json',
};
import replaceFixture from '@family/shared/fixtures/meal-replace.valid.json' with {
  type: 'json',
};
import proposeInput from '@family/shared/fixtures/menu-propose.input.json' with {
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
import { buildTestApp } from '../test/app.js';
import { testDb } from '../test/db.js';
import {
  CHAT_COMPLETIONS_URL,
  completion,
  openclaw,
} from '../test/openclaw.js';
import { stockPantry } from '../test/pantry.js';
import { DANI, POLI } from '../test/users.js';

/** Wednesday 28 October 2026, 10:00 in Sofia: the week of 2 November has not begun. */
const NOW = new Date('2026-10-28T08:00:00Z');
/** The week of the `meal.replace` fixture; its meal is Wednesday's dinner. */
const WEEK = '2026-11-02';
/** The week of `NOW`: Monday 26 and Tuesday 27 are past days. */
const THIS_WEEK = '2026-10-26';

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
  answerInTurn(JSON.stringify(replaceFixture));
});

afterEach(() => openclaw.resetHandlers());

afterAll(async () => {
  await app.close();
  openclaw.close();
});

/** The 10 dinner recipes of the fixtures' registry, with their ids, products and ratings. */
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
      rating: entry.rating,
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

/** Id of recipe `n` of the fixture registry. */
function recipeId(n: number) {
  return `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function inject(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH',
  url: string,
  payload?: object,
  as = DANI.id,
) {
  return app.inject({
    method,
    url,
    headers: { 'x-acting-user': as },
    payload,
  });
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

interface TestMeal {
  id: string;
  date: string;
  recipeId: string | null;
  why: string | null;
  votes: { userId: string; value: string }[];
}

async function createPlan(weekStart: string): Promise<TestMeal[]> {
  const response = await inject('POST', '/api/menu/plans', { weekStart });
  expect(response.statusCode).toBe(201);
  return response.json().plan.meals;
}

async function patchMeal(id: string, payload: object, as = DANI.id) {
  const response = await inject('PATCH', `/api/menu/meals/${id}`, payload, as);
  expect(response.statusCode).toBe(200);
  return response.json().meal as TestMeal;
}

/**
 * The state the input fixture describes: the week of 2 November as Дани planned it, Wednesday's chicken talked over
 * by Поли and Дани, and recipes 4 and 7 in the 2 previous weeks. Returns Wednesday's meal.
 */
async function fixtureWeek(): Promise<TestMeal> {
  // The past weeks were planned before they began: their recipes cannot change once the days are past.
  clock = new Date('2026-10-01T08:00:00Z');
  const twoWeeksBack = await createPlan('2026-10-19');
  await patchMeal(twoWeeksBack[2]?.id ?? '', { recipeId: recipeId(7) });
  const lastWeek = await createPlan(THIS_WEEK);
  await patchMeal(lastWeek[0]?.id ?? '', { recipeId: recipeId(4) });
  clock = NOW;

  const meals = await createPlan(WEEK);
  const plan: [number, object][] = [
    [0, { recipeId: recipeId(3) }],
    [1, { recipeId: recipeId(5) }],
    [2, { recipeId: recipeId(1) }],
    [3, { recipeId: recipeId(8) }],
    [4, { recipeId: recipeId(6) }],
    [5, { recipeId: recipeId(9) }],
    [6, { note: 'ядем навън' }],
  ];
  for (const [index, patch] of plan) {
    await patchMeal(meals[index]?.id ?? '', patch);
  }
  const wednesday = meals[2];
  if (!wednesday) {
    throw new Error('no Wednesday');
  }
  const [, poli, dani] = replaceInput.thread;
  await comment(wednesday.id, poli?.body ?? '', POLI.id);
  await comment(wednesday.id, dani?.body ?? '', DANI.id);
  return wednesday;
}

async function comment(mealId: string, body: string, as: string) {
  const response = await inject(
    'POST',
    `/api/menu/meals/${mealId}/comments`,
    { body },
    as,
  );
  expect(response.statusCode).toBe(201);
}

async function replace(mealId: string, as = POLI.id) {
  const response = await inject(
    'POST',
    `/api/menu/meals/${mealId}/replacements`,
    undefined,
    as,
  );
  expect(response.statusCode).toBe(202);
  return response.json().replacement;
}

/** Polls `GET /api/menu/replacements/:id` until the background run has finished. */
async function finished(id: string, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const response = await inject('GET', `/api/menu/replacements/${id}`);
    expect(response.statusCode).toBe(200);
    const { replacement } = response.json();
    if (replacement.status !== 'pending') {
      return replacement;
    }
    if (Date.now() > deadline) {
      throw new Error(`replacement ${id} still pending`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('POST /api/menu/meals/:id/replacements', () => {
  it('answers 202 with a pending request, then holds the agent’s candidates with title and time', async () => {
    const meal = await fixtureWeek();

    const pending = await replace(meal.id);
    expect(pending).toMatchObject({
      mealId: meal.id,
      status: 'pending',
      requestedBy: POLI.id,
    });
    expect(pending.candidates).toBeUndefined();

    const done = await finished(pending.id);

    expect(done).toMatchObject({ status: 'done' });
    expect(done.finishedAt).toEqual(expect.any(String));
    expect(done.candidates).toEqual([
      {
        recipeId: recipeId(2),
        why: replaceFixture.candidates[0]?.why,
        title: 'Леща яхния',
        prepMinutes: 45,
      },
      {
        recipeId: recipeId(10),
        why: replaceFixture.candidates[1]?.why,
        title: 'Зеленчуков гювеч',
      },
      {
        recipeId: recipeId(7),
        why: replaceFixture.candidates[2]?.why,
        title: 'Омлет със спанак и сирене',
        prepMinutes: 15,
      },
    ]);
  });

  it('sends family-meal the meal, its thread, the rest of the week, the registry without the meal’s recipe and the use-up products', async () => {
    const bodies = answerInTurn(JSON.stringify(replaceFixture));
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
    // Served before the meal: recipes 4 and 7 of the past weeks, and 3 and 5 on Monday and Tuesday before it. The
    // meals after Wednesday are not, though their recipes are in the registry.
    const meal = await fixtureWeek();
    // Staples stay out of the input; use-up products go in, the oldest first.
    await stockPantry(app, [
      { name: 'ориз', kind: 'staple' },
      ...replaceInput.useUp.map((item) => ({
        ...item,
        kind: 'use_up' as const,
      })),
    ]);

    await finished((await replace(meal.id)).id);

    expect(bodies).toHaveLength(1);
    const [body] = bodies;
    expect(body?.model).toBe('openclaw/family-meal');
    expect(body?.response_format.json_schema.name).toBe('meal_replace');
    const input = JSON.parse(body?.messages[0]?.content ?? '');
    const byId = (a: { id: string }, b: { id: string }) =>
      a.id.localeCompare(b.id);
    expect({ ...input, recipes: input.recipes.sort(byId) }).toEqual({
      ...replaceInput,
      recipes: [...replaceInput.recipes].sort(byId),
    });
  });

  it('fails as invalid_output when the retry is invalid too, and keeps no candidates', async () => {
    const meal = await fixtureWeek();
    const unknown = structuredClone(replaceFixture);
    unknown.candidates[0] = { recipeId: recipeId(99), why: 'Няма я.' };
    const ownRecipe = structuredClone(replaceFixture);
    ownRecipe.candidates[0] = { recipeId: recipeId(1), why: 'Пак пиле.' };
    const bodies = answerInTurn(
      JSON.stringify(unknown),
      JSON.stringify(ownRecipe),
    );

    const done = await finished((await replace(meal.id)).id);

    expect(done).toMatchObject({ status: 'failed', error: 'invalid_output' });
    expect(done.candidates).toBeUndefined();
    expect(bodies).toHaveLength(2);
  });

  it('answers 409 past_meal for a meal before today (Sofia)', async () => {
    clock = new Date('2026-10-20T08:00:00Z');
    const meals = await createPlan(THIS_WEEK);
    await patchMeal(meals[0]?.id ?? '', { recipeId: recipeId(1) });
    clock = NOW;

    const response = await inject(
      'POST',
      `/api/menu/meals/${meals[0]?.id}/replacements`,
    );

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: 'conflict',
      code: 'past_meal',
    });
  });

  it('answers 409 not_enough_recipes with fewer than 3 other dinner recipes that are not archived', async () => {
    const meals = await createPlan(WEEK);
    await patchMeal(meals[2]?.id ?? '', { recipeId: recipeId(1) });
    for (const n of [2, 3, 4, 5, 6, 7, 8]) {
      await inject('POST', `/api/recipes/${recipeId(n)}/archive`);
    }

    const response = await inject(
      'POST',
      `/api/menu/meals/${meals[2]?.id}/replacements`,
    );

    // Recipes 9 and 10 are left besides the meal's own.
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: 'conflict',
      code: 'not_enough_recipes',
      have: 2,
      need: 3,
    });
  });

  it('answers 409 while a request for the meal is pending', async () => {
    const meals = await createPlan(WEEK);
    let release = () => {};
    openclaw.use(
      http.post(CHAT_COMPLETIONS_URL, async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return HttpResponse.json(completion(JSON.stringify(replaceFixture)));
      }),
    );
    const pending = await replace(meals[2]?.id ?? '');

    const twice = await inject(
      'POST',
      `/api/menu/meals/${meals[2]?.id}/replacements`,
    );

    expect(twice.statusCode).toBe(409);
    expect(twice.json()).toMatchObject({ error: 'conflict' });
    release();
    await finished(pending.id);
  });

  it('answers 404 for an unknown meal and an unknown request', async () => {
    const unknown = '99999999-9999-4999-8999-999999999999';

    const post = await inject(
      'POST',
      `/api/menu/meals/${unknown}/replacements`,
    );
    const get = await inject('GET', `/api/menu/replacements/${unknown}`);

    expect(post.statusCode).toBe(404);
    expect(get.statusCode).toBe(404);
  });
});

describe('picking a candidate', () => {
  it('is a PATCH with the recipe and its why: the meal changes, the other’s vote goes and a system line is written', async () => {
    const meal = await fixtureWeek();
    const voted = await inject('PUT', `/api/menu/meals/${meal.id}/vote`, {
      value: 'up',
    });
    expect(voted.statusCode).toBe(200);
    const done = await finished((await replace(meal.id)).id);
    const [first] = done.candidates;

    const picked = await patchMeal(
      meal.id,
      { recipeId: first.recipeId, why: first.why },
      POLI.id,
    );

    expect(picked).toMatchObject({
      recipeId: recipeId(2),
      why: first.why,
      votes: [{ userId: POLI.id, value: 'up' }],
    });
    const thread = await inject('GET', `/api/menu/meals/${meal.id}/comments`);
    expect(thread.json().comments.at(-1)).toMatchObject({
      kind: 'system',
      authorUserId: POLI.id,
      body: 'смени „Пиле с ориз на фурна“ → „Леща яхния“',
    });
  });

  it('answers 400 for a why without a recipe', async () => {
    const meals = await createPlan(WEEK);

    const response = await inject('PATCH', `/api/menu/meals/${meals[2]?.id}`, {
      why: 'Защото.',
    });

    expect(response.statusCode).toBe(400);
  });
});
