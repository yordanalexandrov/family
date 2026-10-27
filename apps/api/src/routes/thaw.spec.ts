import {
  ingredientsResponseSchema,
  mealPlanResponseSchema,
  recipeResponseSchema,
} from '@family/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../test/app.js';
import { stockPantry } from '../test/pantry.js';
import {
  createTestPushService,
  deviceSubscription,
  TEST_VAPID_PUBLIC_KEY,
} from '../test/push.js';
import { DANI, POLI } from '../test/users.js';

/** Wednesday 4 November 2026, 12:00 in Sofia: Thursday's dinner can still be changed. */
const NOON = new Date('2026-11-04T10:00:00Z');
/** 20:00 in Sofia on Wednesday, the evening before Thursday 5 November. */
const EVENING = new Date('2026-11-04T18:00:00Z');
/** 08:00 in Sofia on Thursday. */
const MORNING = new Date('2026-11-05T06:00:00Z');
const WEEK = '2026-11-02';
const THURSDAY = '2026-11-05';

let clock = NOON;
let app: FastifyInstance;
let push = createTestPushService();

beforeAll(async () => {
  app = buildTestApp({
    now: () => clock,
    push: {
      publicKey: TEST_VAPID_PUBLIC_KEY,
      sender: (target, payload) => push.sender(target, payload),
    },
  });
  await app.ready();
});

afterAll(() => app.close());

let musakaMealId: string;

beforeEach(async () => {
  clock = NOON;
  push = createTestPushService();
  await subscribe(DANI.id, 'dani-phone');
  await subscribe(POLI.id, 'poli-phone');
  await stockPantry(app, [
    { name: 'смесена кайма', kind: 'staple', frozen: true },
    { name: 'свински врат', kind: 'staple', frozen: true },
    { name: 'лук', kind: 'staple' },
  ]);
  const musaka = await createRecipe('Мусака', [
    'лук',
    'смесена кайма',
    'свински врат',
  ]);
  musakaMealId = await dinnerOn(THURSDAY);
  await patchMeal(musakaMealId, { recipeId: musaka });
});

function as(userId: string) {
  return { 'x-acting-user': userId };
}

async function subscribe(userId: string, device: string) {
  const response = await app.inject({
    method: 'PUT',
    url: '/api/notifications/subscription',
    headers: as(userId),
    payload: deviceSubscription(device),
  });
  expect(response.statusCode).toBe(204);
}

async function ingredientId(name: string): Promise<string> {
  const response = await app.inject({
    method: 'GET',
    url: `/api/ingredients?q=${encodeURIComponent(name)}`,
    headers: as(DANI.id),
  });
  const found = ingredientsResponseSchema
    .parse(response.json())
    .ingredients.find((ingredient) => ingredient.name === name);
  if (!found) {
    throw new Error(`no seed ingredient ${name}`);
  }
  return found.id;
}

async function createRecipe(title: string, products: string[]) {
  const ingredients = [];
  for (const name of products) {
    ingredients.push({
      ingredientId: await ingredientId(name),
      quantity: 500,
      unit: 'g',
    });
  }
  const response = await app.inject({
    method: 'POST',
    url: '/api/recipes',
    headers: as(DANI.id),
    payload: {
      title,
      servings: 4,
      steps: ['Сготви.'],
      tags: ['dinner'],
      ingredients,
    },
  });
  expect(response.statusCode).toBe(201);
  return recipeResponseSchema.parse(response.json()).recipe.id;
}

/** Creates the empty plan of the week and answers the id of the dinner on `date`. */
async function dinnerOn(date: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/menu/plans',
    headers: as(DANI.id),
    payload: { weekStart: WEEK },
  });
  expect(response.statusCode).toBe(201);
  const { plan } = mealPlanResponseSchema.parse(response.json());
  const dinner = plan.meals.find(
    (meal) => meal.date === date && meal.slot === 'dinner',
  );
  if (!dinner) {
    throw new Error(`no dinner on ${date}`);
  }
  return dinner.id;
}

async function patchMeal(id: string, payload: object) {
  const response = await app.inject({
    method: 'PATCH',
    url: `/api/menu/meals/${id}`,
    headers: as(DANI.id),
    payload,
  });
  expect(response.statusCode).toBe(200);
}

function thawed(id: string, userId: string) {
  return app.inject({
    method: 'POST',
    url: `/api/menu/meals/${id}/thawed`,
    headers: as(userId),
  });
}

/** The reminders cron at `at`; answers the „Извади месото“ the push service took during it (not the menu activity). */
async function runAt(at: Date) {
  clock = at;
  const before = push.delivered.length;
  await app.reminders.run();
  return push.delivered
    .slice(before)
    .filter((delivery) => delivery.payload.kind === 'thaw');
}

describe('„Извади месото“ through the reminders cron', () => {
  it('sends the evening one to both phones once, with the frozen products and „Извадих“', async () => {
    const delivered = await runAt(EVENING);

    expect(delivered.map((d) => d.endpoint).sort()).toEqual(
      [
        deviceSubscription('dani-phone').endpoint,
        deviceSubscription('poli-phone').endpoint,
      ].sort(),
    );
    expect(delivered[0]?.payload).toMatchObject({
      kind: 'thaw',
      title: 'Извади месото за утре',
      body: 'Мусака: смесена кайма, свински врат',
      tag: `thaw-${musakaMealId}`,
      url: `/menu?week=${WEEK}`,
      actions: [
        {
          action: 'thawed',
          title: 'Извадих',
          post: `/api/menu/meals/${musakaMealId}/thawed`,
        },
      ],
    });
    expect(await runAt(new Date('2026-11-04T18:05:00Z'))).toEqual([]);
  });

  it('sends the morning one too, unless someone answered „Извадих“', async () => {
    await runAt(EVENING);
    expect(await runAt(MORNING)).toHaveLength(2);
  });

  it('sends no reminder to a person who turned `thaw` off', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/notifications/settings',
      headers: as(DANI.id),
      payload: { settings: { thaw: false, cook: true, menu: true } },
    });
    expect(response.statusCode).toBe(200);

    const delivered = await runAt(EVENING);

    expect(delivered.map((d) => d.payload.userId)).toEqual([POLI.id]);
  });
});

describe('POST /api/menu/meals/:id/thawed', () => {
  it('stops the morning reminder for both, and answers the same when pressed again', async () => {
    await runAt(EVENING);

    expect((await thawed(musakaMealId, POLI.id)).statusCode).toBe(204);
    expect((await thawed(musakaMealId, DANI.id)).statusCode).toBe(204);

    expect(await runAt(MORNING)).toEqual([]);
  });

  it('is undone by a new recipe for the meal, whose products the morning one names', async () => {
    await runAt(EVENING);
    await thawed(musakaMealId, POLI.id);
    clock = new Date('2026-11-04T21:00:00Z');
    const peppers = await createRecipe('Пълнени чушки', [
      'чушка',
      'смесена кайма',
    ]);
    await patchMeal(musakaMealId, { recipeId: peppers });

    const delivered = await runAt(MORNING);

    expect(delivered).toHaveLength(2);
    expect(delivered[0]?.payload).toMatchObject({
      title: 'Извади месото за довечера',
      body: 'Пълнени чушки: смесена кайма',
    });
  });

  it('answers 404 for a meal that does not exist', async () => {
    const response = await thawed(
      '00000000-0000-4000-8000-000000000000',
      DANI.id,
    );
    expect(response.statusCode).toBe(404);
  });
});
