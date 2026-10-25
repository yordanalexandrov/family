import {
  calendarEventsResponseSchema,
  dashboardResponseSchema,
} from '@family/shared';
import type { FastifyInstance } from 'fastify';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { upsertCalendarSources } from '../db/repositories/calendar-sources.js';
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
import { DANI } from '../test/users.js';
import {
  budgetsEndpoint,
  budgetsHandler,
  TEST_BUDGET_ID,
  TEST_WALLET_TOKEN,
  withFamilyPeriod,
} from '../test/wallet.js';

/** Monday 2 November 2026, 10:00 in Sofia. */
const NOW = new Date('2026-11-02T08:00:00Z');
const MINUTE_MS = 60_000;

let clock = NOW;
let app: FastifyInstance;

beforeAll(async () => {
  server.listen({ onUnhandledFrame: 'error' });
  app = buildTestApp({
    googleCalendar: createCalendarClient(TEST_SERVICE_ACCOUNT_JSON, {
      sleep: async () => undefined,
    }),
    wallet: {
      client: createWalletClient(TEST_WALLET_TOKEN),
      budgetId: TEST_BUDGET_ID,
    },
    now: () => clock,
  });
  await app.ready();
});

beforeEach(async () => {
  clock = NOW;
  await upsertCalendarSources(testDb(), TEST_CALENDARS);
  server.use(tokenHandler, eventsHandler(FIXTURE_PAGES), budgetsHandler());
});

afterEach(() => server.resetHandlers());

afterAll(async () => {
  server.close();
  await app.close();
});

function sync(source: 'calendar' | 'budget') {
  return app.inject({
    method: 'POST',
    url: `/api/sync/${source}`,
    headers: { 'x-acting-user': DANI.id },
  });
}

async function getDashboard(target: FastifyInstance = app) {
  const response = await target.inject({
    method: 'GET',
    url: '/api/dashboard',
  });
  expect(response.statusCode).toBe(200);
  return dashboardResponseSchema.parse(response.json());
}

/**
 * Starts a Wallet sync whose request Wallet does not answer until `release()`, which lets it fail and waits
 * for it; resolves once the request has reached Wallet.
 */
async function heldBudgetSync() {
  let reached: () => void = () => undefined;
  const reachedWallet = new Promise<void>((resolve) => {
    reached = resolve;
  });
  let answer: () => void = () => undefined;
  const answered = new Promise<void>((resolve) => {
    answer = resolve;
  });
  server.use(
    budgetsEndpoint(
      async () => {
        reached();
        await answered;
        return Response.json(
          { error: 'Invalid or expired token' },
          { status: 401 },
        );
      },
      { once: true },
    ),
  );
  const running = sync('budget');
  await reachedWallet;
  return {
    async release() {
      answer();
      await running;
    },
  };
}

/** An app without Google or Wallet config, with its clock at `now`. */
async function withUnconfiguredApp(
  now: Date,
  use: (target: FastifyInstance) => Promise<void>,
) {
  const unconfigured = buildTestApp({ now: () => now });
  try {
    await use(unconfigured);
  } finally {
    await unconfigured.close();
  }
}

describe('GET /api/dashboard', () => {
  it('answers without an acting user, with empty days, no budget and both sources unconfigured when nothing is configured', async () => {
    await withUnconfiguredApp(NOW, async (unconfigured) => {
      const body = await getDashboard(unconfigured);

      expect(body.today).toBe('2026-11-02');
      expect(body.now).toBe(NOW.toISOString());
      expect(body.days.map((day) => day.date)).toEqual([
        '2026-11-02',
        '2026-11-03',
        '2026-11-04',
        '2026-11-05',
      ]);
      expect(body.days.every((day) => day.events.length === 0)).toBe(true);
      expect(body.budget).toBeNull();
      expect(body.cooking).toEqual({ lunch: null, dinner: null });
      expect(body.sync.calendar).toEqual({
        source: 'calendar',
        status: 'unconfigured',
        lastSuccessAt: null,
        lastError: null,
      });
      expect(body.sync.budget.status).toBe('unconfigured');
    });
  });

  it('shows today and the next three days in Sofia across the end of the month', async () => {
    // 23:30 on Saturday 31 October in Sofia is still the 31st in UTC too, but the days run into November.
    await withUnconfiguredApp(
      new Date('2026-10-31T21:30:00Z'),
      async (unconfigured) => {
        const body = await getDashboard(unconfigured);

        expect(body.today).toBe('2026-10-31');
        expect(body.days.map((day) => day.date)).toEqual([
          '2026-10-31',
          '2026-11-01',
          '2026-11-02',
          '2026-11-03',
        ]);
      },
    );
  });

  it('starts the day at midnight in Sofia on the night summer time ends', async () => {
    // 00:30 on 25 October in Sofia (EEST, UTC+3) is still the 24th in UTC.
    await withUnconfiguredApp(
      new Date('2026-10-24T21:30:00Z'),
      async (unconfigured) => {
        const body = await getDashboard(unconfigured);

        expect(body.today).toBe('2026-10-25');
        expect(body.days.map((day) => day.date)).toEqual([
          '2026-10-25',
          '2026-10-26',
          '2026-10-27',
          '2026-10-28',
        ]);
      },
    );
  });

  it('shows the synced events of the four days as the calendar screen does', async () => {
    await sync('calendar');

    const body = await getDashboard();

    const calendar = await app.inject({
      method: 'GET',
      url: '/api/calendar/events?from=2026-11-02&to=2026-11-06',
    });
    const expected = calendarEventsResponseSchema.parse(calendar.json()).days;
    expect(expected.some((day) => day.events.length > 0)).toBe(true);
    expect(body.days).toEqual(expected);
    expect(body.sync.calendar).toEqual({
      source: 'calendar',
      status: 'ok',
      lastSuccessAt: NOW.toISOString(),
      lastError: null,
    });
  });

  it('shows the newest budget snapshot', async () => {
    await sync('budget');
    clock = new Date(NOW.getTime() + 60 * MINUTE_MS);
    server.use(
      budgetsHandler(withFamilyPeriod({ spent: 500, remaining: 2700 })),
    );
    await sync('budget');

    const body = await getDashboard();

    expect(body.budget).toEqual({
      walletBudgetId: TEST_BUDGET_ID,
      name: 'Общ месечен бюджет',
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      limit: 3200,
      spent: 500,
      remaining: 2700,
      currency: 'EUR',
      syncedAt: clock.toISOString(),
    });
    expect(body.sync.budget.status).toBe('ok');
  });

  it('marks the calendar stale 25 minutes after its last success', async () => {
    await sync('calendar');
    await sync('budget');
    clock = new Date(NOW.getTime() + 25 * MINUTE_MS);

    const body = await getDashboard();

    expect(body.sync.calendar).toMatchObject({
      status: 'stale',
      lastSuccessAt: NOW.toISOString(),
    });
    expect(body.sync.budget.status).toBe('ok');
  });

  it('keeps the last budget and reports the failure when the latest Wallet sync failed', async () => {
    await sync('budget');
    clock = new Date(NOW.getTime() + 60 * MINUTE_MS);
    server.use(
      budgetsEndpoint(() =>
        Response.json({ error: 'Invalid or expired token' }, { status: 401 }),
      ),
    );
    await sync('budget');

    const body = await getDashboard();

    expect(body.budget?.spent).toBe(412.35);
    expect(body.sync.budget).toEqual({
      source: 'budget',
      status: 'failed',
      lastSuccessAt: NOW.toISOString(),
      lastError: 'wallet_unauthorized',
    });
  });
  it('still reports the failure while the next Wallet sync is under way', async () => {
    server.use(
      budgetsEndpoint(
        () =>
          Response.json({ error: 'Invalid or expired token' }, { status: 401 }),
        { once: true },
      ),
    );
    await sync('budget');
    clock = new Date(NOW.getTime() + 60 * MINUTE_MS);
    const next = await heldBudgetSync();

    try {
      const body = await getDashboard();

      expect(body.sync.budget).toEqual({
        source: 'budget',
        status: 'failed',
        lastSuccessAt: null,
        lastError: 'wallet_unauthorized',
      });
    } finally {
      await next.release();
    }
  });

  it('reports a configured source that has never synced as stale, also during its first sync', async () => {
    expect((await getDashboard()).sync.budget).toMatchObject({
      status: 'stale',
      lastSuccessAt: null,
    });

    const first = await heldBudgetSync();

    try {
      expect((await getDashboard()).sync.budget).toMatchObject({
        status: 'stale',
        lastSuccessAt: null,
        lastError: null,
      });
    } finally {
      await first.release();
    }
  });
});
