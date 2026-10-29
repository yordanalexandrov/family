import { dashboardResponseSchema } from '@family/shared';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { upsertCalendarSources } from '../db/repositories/calendar-sources.js';
import { upsertPushSubscription } from '../db/repositories/notifications.js';
import {
  budgetSnapshot,
  calendarEvent,
  syncRun,
} from '../db/schema/dashboard.js';
import { ingredient, recipe, recipeIngredient } from '../db/schema/food.js';
import { meal, mealPlan } from '../db/schema/menu.js';
import { pantryItem } from '../db/schema/pantry.js';
import { createCalendarClient } from '../integrations/google-calendar/client.js';
import { createWalletClient } from '../integrations/wallet/client.js';
import { buildTestApp } from '../test/app.js';
import { testDb } from '../test/db.js';
import {
  eventsHandler,
  FIXTURE_PAGES,
  TEST_CALENDARS,
  TEST_SERVICE_ACCOUNT_JSON,
  tokenHandler,
} from '../test/google.js';
import { server } from '../test/msw.js';
import {
  createTestPushService,
  deviceSubscription,
  TEST_VAPID_PUBLIC_KEY,
} from '../test/push.js';
import { DANI, POLI } from '../test/users.js';
import {
  budgetsEndpoint,
  budgetsHandler,
  TEST_BUDGET_ID,
  TEST_WALLET_TOKEN,
} from '../test/wallet.js';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));

afterAll(() => server.close());

describe('scheduler', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
    server.resetHandlers();
  });

  it('syncs the calendar by itself once the app is ready', async () => {
    await upsertCalendarSources(testDb(), TEST_CALENDARS);
    server.use(tokenHandler, eventsHandler(FIXTURE_PAGES));
    app = buildTestApp({
      googleCalendar: createCalendarClient(TEST_SERVICE_ACCOUNT_JSON),
      now: () => new Date('2026-11-02T08:00:00Z'),
      scheduler: { firstRunDelayMs: 0 },
    });

    await app.ready();

    await vi.waitFor(async () => {
      expect(await testDb().select().from(syncRun)).toEqual([
        expect.objectContaining({ source: 'calendar', status: 'ok' }),
      ]);
    });
    expect(await testDb().select().from(calendarEvent)).toHaveLength(7);
  });

  it('syncs the budget by itself once the app is ready', async () => {
    server.use(budgetsHandler());
    app = buildTestApp({
      wallet: {
        client: createWalletClient(TEST_WALLET_TOKEN),
        budgetId: TEST_BUDGET_ID,
      },
      scheduler: { firstRunDelayMs: 0 },
    });

    await app.ready();

    await vi.waitFor(async () => {
      expect(await testDb().select().from(syncRun)).toEqual([
        expect.objectContaining({ source: 'budget', status: 'ok' }),
      ]);
    });
    expect(await testDb().select().from(budgetSnapshot)).toHaveLength(1);
  });
  it('sends the reminders that are due by itself once the app is ready', async () => {
    const db = testDb();
    const [kaima] = await db
      .select({ id: ingredient.id })
      .from(ingredient)
      .where(sql`${ingredient.name} = 'смесена кайма'`);
    const [musaka] = await db
      .insert(recipe)
      .values({
        title: 'Мусака',
        servings: 4,
        steps: ['Сготви.'],
        tags: ['dinner'],
      })
      .returning({ id: recipe.id });
    if (!kaima || !musaka) {
      throw new Error('no recipe');
    }
    await db.insert(recipeIngredient).values({
      recipeId: musaka.id,
      ingredientId: kaima.id,
      position: 0,
      quantity: '500',
      unit: 'g',
    });
    await db
      .insert(pantryItem)
      .values({ ingredientId: kaima.id, kind: 'staple', frozen: true });
    const [plan] = await db
      .insert(mealPlan)
      .values({ weekStart: '2026-11-02' })
      .returning({ id: mealPlan.id });
    await db.insert(meal).values({
      planId: plan?.id ?? '',
      date: '2026-11-05',
      slot: 'dinner',
      recipeId: musaka.id,
      servings: {},
    });
    await upsertPushSubscription(db, DANI.id, deviceSubscription('dani'));
    const push = createTestPushService();
    app = buildTestApp({
      push: { publicKey: TEST_VAPID_PUBLIC_KEY, sender: push.sender },
      // Wednesday after 09:00: without OpenClaw the cron proposes no menu.
      openclaw: undefined,
      // 20:00 in Sofia the evening before.
      now: () => new Date('2026-11-04T18:00:00Z'),
      scheduler: { firstRunDelayMs: 0 },
    });

    await app.ready();

    await vi.waitFor(() => {
      expect(push.delivered.map((d) => d.payload.title)).toEqual([
        'Извади месото за утре',
      ]);
    });
  });

  it('prunes sync history older than a week but keeps the last success of each source', async () => {
    let clock = new Date('2026-10-10T12:00:00Z');
    const reader = buildTestApp({
      wallet: {
        client: createWalletClient(TEST_WALLET_TOKEN),
        budgetId: TEST_BUDGET_ID,
      },
      now: () => clock,
    });
    const budgetStatus = async () => {
      const response = await reader.inject({
        method: 'GET',
        url: '/api/dashboard',
      });
      return dashboardResponseSchema.parse(response.json()).sync.budget;
    };
    try {
      const syncBudget = () =>
        reader.inject({
          method: 'POST',
          url: '/api/sync/budget',
          headers: { 'x-acting-user': DANI.id },
        });
      server.use(budgetsHandler());
      await syncBudget();
      clock = new Date('2026-10-11T12:00:00Z');
      server.use(
        budgetsEndpoint(() =>
          Response.json({ error: 'Invalid or expired token' }, { status: 401 }),
        ),
      );
      await syncBudget();
      clock = new Date('2026-10-25T12:00:00Z');
      expect((await budgetStatus()).status).toBe('failed');

      app = buildTestApp({
        now: () => clock,
        scheduler: { firstRunDelayMs: 0 },
      });
      await app.ready();

      // The old failure is gone, so the budget is judged by its old success again.
      await vi.waitFor(async () => {
        expect(await budgetStatus()).toMatchObject({
          status: 'stale',
          lastSuccessAt: '2026-10-10T12:00:00.000Z',
        });
      });
    } finally {
      await reader.close();
    }
  });

  it('sends the menu activity that has gone quiet by itself, in the reminders job', async () => {
    const push = createTestPushService();
    let clock = new Date('2026-10-28T08:00:00Z');
    // Before a restart: Poli votes while Dani's phone is subscribed.
    const before = buildTestApp({
      now: () => clock,
      push: { publicKey: TEST_VAPID_PUBLIC_KEY, sender: push.sender },
    });
    try {
      const act = (
        user: string,
        method: 'PUT' | 'POST',
        url: string,
        payload: object,
      ) =>
        before.inject({
          method,
          url,
          headers: { 'x-acting-user': user },
          payload,
        });
      await act(
        DANI.id,
        'PUT',
        '/api/notifications/subscription',
        deviceSubscription('dani'),
      );
      const plan = await act(POLI.id, 'POST', '/api/menu/plans', {
        weekStart: '2026-11-02',
      });
      const [first] = plan.json().plan.meals;
      // A note, so the day can be voted on (an empty one cannot), without anyone's activity.
      await testDb().update(meal).set({ note: 'остатъци' });
      const voted = await act(
        POLI.id,
        'PUT',
        `/api/menu/meals/${first.id}/vote`,
        { value: 'up' },
      );
      expect(voted.statusCode).toBe(200);
    } finally {
      await before.close();
    }

    clock = new Date('2026-10-28T08:10:00Z');
    app = buildTestApp({
      now: () => clock,
      push: { publicKey: TEST_VAPID_PUBLIC_KEY, sender: push.sender },
      // Without OpenClaw, so the cron's menu proposal (due at this time) stays out of the way.
      openclaw: undefined,
      scheduler: { firstRunDelayMs: 0 },
    });
    await app.ready();

    await vi.waitFor(() =>
      expect(push.delivered).toEqual([
        expect.objectContaining({
          payload: expect.objectContaining({ userId: DANI.id, body: '1 глас' }),
        }),
      ]),
    );
  });
});
