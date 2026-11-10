import {
  dashboardResponseSchema,
  ingredientsResponseSchema,
  mealPlanResponseSchema,
  recipeResponseSchema,
  type ServerEvent,
} from '@family/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../test/app.js';
import { inboxOf } from '../test/inbox.js';
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
      steps: [{ text: 'Сготви.' }],
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

/** The id of the dinner on `date` in the week's plan, which exists already. */
async function dinnerIdOn(date: string): Promise<string> {
  const response = await app.inject({
    method: 'GET',
    url: `/api/menu/plans?weekStart=${WEEK}`,
    headers: as(DANI.id),
  });
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
      url: `/menu?week=${WEEK}&meal=${musakaMealId}`,
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

  it('rings no phone of a person who turned `thaw` off, but keeps the reminder in their inbox', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/notifications/settings',
      headers: as(DANI.id),
      payload: { settings: { thaw: false, cook: true, menu: true } },
    });
    expect(response.statusCode).toBe(200);

    const delivered = await runAt(EVENING);

    expect(delivered.map((d) => d.payload.userId)).toEqual([POLI.id]);
    for (const userId of [DANI.id, POLI.id]) {
      // Poli also has Dani's changes of the menu in the setup.
      const thaw = (await inboxOf(app, userId)).filter(
        (item) => item.kind === 'thaw',
      );
      expect(thaw).toMatchObject([
        {
          kind: 'thaw',
          title: 'Извади месото за утре',
          body: 'Мусака: смесена кайма, свински врат',
          url: `/menu?week=${WEEK}&meal=${musakaMealId}`,
          unread: true,
        },
      ]);
    }
  });

  it('details in the inbox each frozen product, with the pantry, and the dinner, with its day in the menu', async () => {
    await runAt(EVENING);

    const [thaw] = await inboxOf(app, DANI.id);
    expect(thaw?.details).toEqual([
      { text: 'Във фризера: смесена кайма', url: '/pantry' },
      { text: 'Във фризера: свински врат', url: '/pantry' },
      {
        text: 'Вечеря: Мусака, четвъртък',
        url: `/menu?week=${WEEK}&meal=${musakaMealId}`,
      },
    ]);
    expect(push.delivered[0]?.payload).not.toHaveProperty('details');
  });

  it('details the cook of the dinner, when it has one', async () => {
    await patchMeal(musakaMealId, { cookUserId: POLI.id });

    await runAt(EVENING);

    const [thaw] = (await inboxOf(app, DANI.id)).filter(
      (item) => item.kind === 'thaw',
    );
    expect(thaw?.details.at(-1)).toEqual({ text: 'Готви: Поли' });
  });

  it('updates the details with the morning one, as the dinner is then', async () => {
    await runAt(EVENING);
    await patchMeal(musakaMealId, { cookUserId: POLI.id });

    await runAt(MORNING);

    const thaw = (await inboxOf(app, DANI.id)).filter(
      (item) => item.kind === 'thaw',
    );
    expect(thaw).toHaveLength(1);
    expect(thaw[0]?.details.map((detail) => detail.text)).toEqual([
      'Във фризера: смесена кайма',
      'Във фризера: свински врат',
      'Вечеря: Мусака, четвъртък',
      'Готви: Поли',
    ]);
  });

  it('updates the evening one in the inbox with the morning one, unread again', async () => {
    await runAt(EVENING);
    const [evening] = await inboxOf(app, DANI.id);
    await app.inject({
      method: 'POST',
      url: `/api/inbox/${evening?.id}/read`,
      headers: as(DANI.id),
    });

    await runAt(MORNING);

    expect(await inboxOf(app, DANI.id)).toMatchObject([
      { id: evening?.id, title: 'Извади месото за довечера', unread: true },
    ]);
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

  it('stays with the meal when its day is swapped', async () => {
    await runAt(EVENING);
    await thawed(musakaMealId, POLI.id);
    clock = new Date('2026-11-04T21:00:00Z');
    const friday = await dinnerIdOn('2026-11-06');
    const response = await app.inject({
      method: 'POST',
      url: `/api/menu/meals/${musakaMealId}/swap`,
      headers: as(DANI.id),
      payload: { withMealId: friday },
    });
    expect(response.statusCode).toBe(200);

    // Thursday evening is the eve of the moved musaka, Friday morning its day: it was taken out already.
    expect(await runAt(new Date('2026-11-05T18:00:00Z'))).toEqual([]);
    expect(await runAt(new Date('2026-11-06T06:00:00Z'))).toEqual([]);
  });

  it('signals menu.changed for the week, so the other phone drops „Извадих“ at once', async () => {
    const signals: ServerEvent[] = [];
    const unsubscribe = app.events.subscribe((event) => signals.push(event));

    await thawed(musakaMealId, POLI.id);
    unsubscribe();

    expect(signals).toEqual([{ type: 'menu.changed', weekStart: WEEK }]);
  });

  it('answers 404 for a meal that does not exist', async () => {
    const response = await thawed(
      '00000000-0000-4000-8000-000000000000',
      DANI.id,
    );
    expect(response.statusCode).toBe(404);
  });
});

describe('thaw in GET /api/dashboard', () => {
  async function thaw(at: Date) {
    clock = at;
    const response = await app.inject({ method: 'GET', url: '/api/dashboard' });
    expect(response.statusCode).toBe(200);
    return dashboardResponseSchema.parse(response.json()).thaw;
  }

  it('shows tomorrow’s frozen products from the evening reminder’s hour on, not before', async () => {
    expect(await thaw(new Date('2026-11-04T17:59:00Z'))).toEqual([]);

    expect(await thaw(EVENING)).toEqual([
      {
        mealId: musakaMealId,
        date: THURSDAY,
        products: ['смесена кайма', 'свински врат'],
        thawedAt: null,
      },
    ]);
  });

  it('shows today’s all day, with when someone answered „Извадих“', async () => {
    clock = new Date('2026-11-05T07:00:00Z');
    expect((await thawed(musakaMealId, POLI.id)).statusCode).toBe(204);

    expect(await thaw(new Date('2026-11-05T19:00:00Z'))).toEqual([
      {
        mealId: musakaMealId,
        date: THURSDAY,
        products: ['смесена кайма', 'свински врат'],
        thawedAt: '2026-11-05T07:00:00.000Z',
      },
    ]);
  });

  it('leaves out a dinner without frozen products', async () => {
    const salad = await createRecipe('Салата', ['лук']);
    await patchMeal(musakaMealId, { recipeId: salad });

    expect(await thaw(MORNING)).toEqual([]);
  });
});

describe('„Извадих“ in GET /api/inbox', () => {
  /** Thursday 23:59 in Sofia, the last minute of the dinner's day. */
  const LAST_MINUTE = new Date('2026-11-05T21:59:00Z');
  /** Friday 00:00 in Sofia: the dinner's day is over. */
  const NEXT_DAY = new Date('2026-11-05T22:00:00Z');

  async function thawItem(userId: string) {
    const items = await inboxOf(app, userId);
    return items.find((item) => item.kind === 'thaw');
  }

  it('gives „Извадих“ until the end of the dinner’s day while no one answered, then only the text', async () => {
    await runAt(EVENING);
    const button = {
      action: 'thawed',
      title: 'Извадих',
      post: `/api/menu/meals/${musakaMealId}/thawed`,
    };

    clock = LAST_MINUTE;
    const before = await thawItem(DANI.id);
    expect(before?.actions).toEqual([button]);
    expect(before?.answered).toBeUndefined();

    clock = NEXT_DAY;
    const after = await thawItem(DANI.id);
    expect(after).toMatchObject({ title: 'Извади месото за утре' });
    expect(after?.actions).toBeUndefined();
    expect(after?.answered).toBeUndefined();
  });

  it('says who took the meat out after „Извадих“, instead of the button', async () => {
    await runAt(EVENING);

    expect((await thawed(musakaMealId, POLI.id)).statusCode).toBe(204);

    const atDani = await thawItem(DANI.id);
    expect(atDani?.actions).toBeUndefined();
    expect(atDani?.answered).toEqual({ text: 'Поли извади месото' });
    expect((await thawItem(POLI.id))?.answered).toEqual({
      text: 'Ти извади месото',
    });
  });

  it('gives „Извадих“ again after a new recipe undid it', async () => {
    await runAt(EVENING);
    await thawed(musakaMealId, POLI.id);
    const peppers = await createRecipe('Пълнени чушки', [
      'чушка',
      'смесена кайма',
    ]);
    await patchMeal(musakaMealId, { recipeId: peppers });

    const item = await thawItem(DANI.id);
    expect(item?.actions).toHaveLength(1);
    expect(item?.answered).toBeUndefined();
  });

  it('signals inbox.changed to each who has the reminder after „Извадих“, so their row drops the button at once', async () => {
    await runAt(EVENING);
    const signals: ServerEvent[] = [];
    const unsubscribe = app.events.subscribe((event) => signals.push(event));

    await thawed(musakaMealId, POLI.id);
    unsubscribe();

    expect(
      signals
        .filter((event) => event.type === 'inbox.changed')
        .map((event) => event.userId)
        .sort(),
    ).toEqual([DANI.id, POLI.id].sort());
  });

  it('gives nothing after the dinner’s day, answered or not', async () => {
    await runAt(EVENING);
    await thawed(musakaMealId, POLI.id);

    clock = NEXT_DAY;
    const item = await thawItem(DANI.id);
    expect(item?.actions).toBeUndefined();
    expect(item?.answered).toBeUndefined();
  });
});
