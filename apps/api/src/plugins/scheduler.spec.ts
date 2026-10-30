import type { ImportPayload } from '@family/shared';
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
import {
  ingredient,
  recipe,
  recipeImportRequest,
  recipeIngredient,
  recipeSuggestion,
} from '../db/schema/food.js';
import { meal, mealPlan } from '../db/schema/menu.js';
import { pantryItem } from '../db/schema/pantry.js';
import { stepPhoto } from '../db/schema/step-photo.js';
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
import { storedStepPhoto } from '../test/photos.js';
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
        steps: [{ text: 'Сготви.' }],
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

  describe('step photo orphans', () => {
    /** The log lines of an app, parsed. */
    function capturedLog() {
      const lines: Record<string, unknown>[] = [];
      return {
        lines,
        logger: {
          level: 'info',
          stream: { write: (line: string) => lines.push(JSON.parse(line)) },
        },
      };
    }

    async function photoStatus(id: string): Promise<number> {
      if (!app) {
        throw new Error('no app');
      }
      const response = await app.inject({
        method: 'GET',
        url: `/api/step-photos/${id}?w=16`,
      });
      return response.statusCode;
    }

    async function recipeWithPhoto(photoId: string, archived = false) {
      const [row] = await testDb()
        .insert(recipe)
        .values({
          title: `Рецепта ${photoId}`,
          servings: 2,
          steps: [{ text: 'Нарежи.', photoId }, { text: 'Печи.' }],
          tags: ['dinner'],
          archivedAt: archived ? new Date('2026-10-01T12:00:00Z') : null,
        })
        .returning({ id: recipe.id });
      if (!row) {
        throw new Error('no recipe');
      }
      return row.id;
    }

    async function importedSuggestionWithPhoto(
      photoId: string,
      status: 'proposed' | 'rejected',
    ) {
      const [request] = await testDb()
        .insert(recipeImportRequest)
        .values({
          source: 'text',
          text: 'Рецепта',
          status: 'done',
          requestedBy: DANI.id,
        })
        .returning({ id: recipeImportRequest.id });
      await testDb()
        .insert(recipeSuggestion)
        .values({
          importRequestId: request?.id ?? '',
          position: 0,
          status,
          payload: {
            title: `Внесена ${photoId}`,
            steps: [{ text: 'Сготви.', photoId }],
          } as unknown as ImportPayload,
        });
    }

    /** Six stored photos, every one uploaded on 1 November but `fresh` (the night of 4 to 5 November). */
    async function photos() {
      const uploader = buildTestApp();
      try {
        const ids = {
          inRecipe: await storedStepPhoto(uploader),
          inArchivedRecipe: await storedStepPhoto(uploader),
          inProposed: await storedStepPhoto(uploader),
          inRejected: await storedStepPhoto(uploader),
          ofDeletedRecipe: await storedStepPhoto(uploader),
          unsaved: await storedStepPhoto(uploader),
          fresh: await storedStepPhoto(uploader),
        };
        await testDb()
          .update(stepPhoto)
          .set({ createdAt: new Date('2026-11-01T12:00:00Z') });
        await testDb()
          .update(stepPhoto)
          .set({ createdAt: new Date('2026-11-04T23:00:00Z') })
          .where(sql`${stepPhoto.id} = ${ids.fresh}`);
        await recipeWithPhoto(ids.inRecipe);
        await recipeWithPhoto(ids.inArchivedRecipe, true);
        await importedSuggestionWithPhoto(ids.inProposed, 'proposed');
        await importedSuggestionWithPhoto(ids.inRejected, 'rejected');
        const deleted = await recipeWithPhoto(ids.ofDeletedRecipe);
        await testDb().delete(recipe).where(sql`${recipe.id} = ${deleted}`);
        return ids;
      } finally {
        await uploader.close();
      }
    }

    it('removes at night every photo no recipe or proposed suggestion points at, once older than a day, and logs how many', async () => {
      const ids = await photos();
      const log = capturedLog();
      app = buildTestApp({
        openclaw: undefined,
        // 03:30 in Sofia.
        now: () => new Date('2026-11-05T01:30:00Z'),
        logger: log.logger,
        scheduler: { firstRunDelayMs: 0 },
      });
      await app.ready();

      await vi.waitFor(async () => {
        expect(await photoStatus(ids.unsaved)).toBe(404);
      });
      expect(await photoStatus(ids.inRejected)).toBe(404);
      expect(await photoStatus(ids.ofDeletedRecipe)).toBe(404);
      expect(await photoStatus(ids.inRecipe)).toBe(200);
      expect(await photoStatus(ids.inArchivedRecipe)).toBe(200);
      expect(await photoStatus(ids.inProposed)).toBe(200);
      // Uploaded two and a half hours ago: an edit under way, not yet saved.
      expect(await photoStatus(ids.fresh)).toBe(200);
      await vi.waitFor(() => {
        expect(log.lines).toContainEqual(
          expect.objectContaining({ job: 'step-photo-orphans', removed: 3 }),
        );
      });
    });

    it('keeps orphans during the day', async () => {
      const ids = await photos();
      const log = capturedLog();
      app = buildTestApp({
        openclaw: undefined,
        // 14:00 in Sofia.
        now: () => new Date('2026-11-05T12:00:00Z'),
        logger: log.logger,
        scheduler: { firstRunDelayMs: 0 },
      });
      await app.ready();

      await vi.waitFor(() => {
        expect(log.lines).toContainEqual(
          expect.objectContaining({
            job: 'step-photo-orphans',
            msg: 'job finished',
          }),
        );
      });
      expect(await photoStatus(ids.unsaved)).toBe(200);
    });
  });
});
