import {
  cookTakenSchema,
  mealPlanResponseSchema,
  type ServerEvent,
} from '@family/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../test/app.js';
import {
  createTestPushService,
  deviceSubscription,
  TEST_VAPID_PUBLIC_KEY,
} from '../test/push.js';
import { DANI, POLI } from '../test/users.js';

/** Thursday 5 November 2026, 12:00 in Sofia. */
const NOON = new Date('2026-11-05T10:00:00Z');
/** 16:00 in Sofia on Thursday. */
const AFTERNOON = new Date('2026-11-05T14:00:00Z');
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

let mealId: string;

beforeEach(async () => {
  clock = NOON;
  push = createTestPushService();
  await subscribe(DANI.id, 'dani-phone');
  await subscribe(POLI.id, 'poli-phone');
  mealId = await dinnerOn(THURSDAY);
  await patchMeal(mealId, { note: 'Мусака' });
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

async function cookOf(id: string): Promise<string | null> {
  const response = await app.inject({
    method: 'GET',
    url: `/api/menu/plans?weekStart=${WEEK}`,
    headers: as(DANI.id),
  });
  const { plan } = mealPlanResponseSchema.parse(response.json());
  return plan.meals.find((meal) => meal.id === id)?.cookUserId ?? null;
}

function claim(id: string, userId: string) {
  return app.inject({
    method: 'POST',
    url: `/api/menu/meals/${id}/cook-claim`,
    headers: as(userId),
  });
}

/** The „Кой готви“ notifications the push service took since `before`, as `[device, payload]`. */
function cookSince(before: number) {
  return push.delivered
    .slice(before)
    .filter((delivery) => delivery.payload.kind === 'cook');
}

/** The reminders cron at `at`; answers the „Кой готви“ it sent. */
async function runAt(at: Date) {
  clock = at;
  const before = push.delivered.length;
  await app.reminders.run();
  return cookSince(before);
}

describe('„Кой готви довечера“ through the reminders cron', () => {
  it('tells only the cook at 16:00, once', async () => {
    await patchMeal(mealId, { cookUserId: POLI.id });

    const delivered = await runAt(AFTERNOON);

    expect(delivered.map((d) => d.endpoint)).toEqual([
      deviceSubscription('poli-phone').endpoint,
    ]);
    expect(delivered[0]?.payload).toEqual({
      kind: 'cook',
      userId: POLI.id,
      title: 'Довечера готвиш ти',
      body: 'Мусака',
      tag: `cook-${mealId}`,
      url: `/menu?week=${WEEK}&meal=${mealId}`,
    });
    expect(await runAt(new Date('2026-11-05T14:05:00Z'))).toEqual([]);
  });

  it('asks both who cooks, with „Аз“, when the dinner has no cook', async () => {
    const delivered = await runAt(AFTERNOON);

    expect(delivered.map((d) => d.payload.userId).sort()).toEqual(
      [DANI.id, POLI.id].sort(),
    );
    expect(delivered[0]?.payload).toMatchObject({
      title: 'Кой готви довечера?',
      body: 'Мусака',
      tag: `cook-${mealId}`,
      actions: [
        {
          action: 'cook-claim',
          title: 'Аз',
          post: `/api/menu/meals/${mealId}/cook-claim`,
        },
      ],
    });
  });

  it('sends nothing to a person who turned `cook` off', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/notifications/settings',
      headers: as(DANI.id),
      payload: { settings: { thaw: true, cook: false, menu: true } },
    });
    expect(response.statusCode).toBe(200);

    const delivered = await runAt(AFTERNOON);

    expect(delivered.map((d) => d.payload.userId)).toEqual([POLI.id]);
  });
});

describe('POST /api/menu/meals/:id/cook-claim', () => {
  it('makes the first to answer „Аз“ the cook and signals menu.changed for the week', async () => {
    await runAt(AFTERNOON);
    const signals: ServerEvent[] = [];
    const unsubscribe = app.events.subscribe((event) => signals.push(event));

    const response = await claim(mealId, DANI.id);
    unsubscribe();

    expect(response.statusCode).toBe(204);
    expect(await cookOf(mealId)).toBe(DANI.id);
    expect(signals).toContainEqual({ type: 'menu.changed', weekStart: WEEK });
  });

  it('replaces the question at the other with who cooks', async () => {
    await runAt(AFTERNOON);
    const before = push.delivered.length;

    await claim(mealId, DANI.id);

    const delivered = cookSince(before).filter(
      (d) => d.payload.userId === POLI.id,
    );
    expect(delivered.map((d) => d.endpoint)).toEqual([
      deviceSubscription('poli-phone').endpoint,
    ]);
    expect(delivered[0]?.payload).toEqual({
      kind: 'cook',
      userId: POLI.id,
      title: 'Довечера готви Дани',
      body: 'Мусака',
      tag: `cook-${mealId}`,
      url: `/menu?week=${WEEK}&meal=${mealId}`,
    });
  });

  it('tells the one who answered, on every device, that they cook tonight', async () => {
    await subscribe(DANI.id, 'dani-tablet');
    await runAt(AFTERNOON);
    const before = push.delivered.length;

    await claim(mealId, DANI.id);

    const toDani = cookSince(before).filter(
      (d) => d.payload.userId === DANI.id,
    );
    expect(toDani.map((d) => d.endpoint).sort()).toEqual(
      [
        deviceSubscription('dani-phone').endpoint,
        deviceSubscription('dani-tablet').endpoint,
      ].sort(),
    );
    expect(toDani[0]?.payload).toEqual({
      kind: 'cook',
      userId: DANI.id,
      title: 'Довечера готвиш ти',
      body: 'Мусака',
      tag: `cook-${mealId}`,
      url: `/menu?week=${WEEK}&meal=${mealId}`,
    });
  });

  it('replaces the question at the other when the meal moved to another day', async () => {
    await runAt(AFTERNOON);
    clock = new Date('2026-11-05T14:10:00Z');
    const response = await app.inject({
      method: 'POST',
      url: `/api/menu/meals/${mealId}/swap`,
      headers: as(POLI.id),
      payload: { withMealId: await dinnerIdOn('2026-11-06') },
    });
    expect(response.statusCode).toBe(200);
    const before = push.delivered.length;

    await claim(mealId, DANI.id);

    expect(
      cookSince(before)
        .filter((d) => d.payload.userId === POLI.id)
        .map((d) => d.payload.title),
    ).toEqual(['Довечера готви Дани']);
  });

  it('answers 409 cook_taken with the cook and their name to the second', async () => {
    await runAt(AFTERNOON);
    await claim(mealId, DANI.id);
    const before = push.delivered.length;

    const response = await claim(mealId, POLI.id);

    expect(response.statusCode).toBe(409);
    expect(cookTakenSchema.parse(response.json())).toMatchObject({
      code: 'cook_taken',
      cookUserId: DANI.id,
      cookName: 'Дани',
    });
    expect(await cookOf(mealId)).toBe(DANI.id);
    expect(cookSince(before)).toEqual([]);
  });

  it('answers 404 for a meal that does not exist', async () => {
    const response = await claim(
      '00000000-0000-4000-8000-000000000000',
      DANI.id,
    );
    expect(response.statusCode).toBe(404);
  });
});
