import { syncRunResultSchema } from '@family/shared';
import type { FastifyInstance } from 'fastify';
import { HttpResponse } from 'msw';
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
import { budgetSnapshot, syncRun } from '../db/schema/dashboard.js';
import { createWalletClient } from '../integrations/wallet/client.js';
import { buildTestApp } from '../test/app.js';
import { testDb } from '../test/db.js';
import { server } from '../test/msw.js';
import { DANI } from '../test/users.js';
import {
  BUDGETS_CURRENT,
  budgetsEndpoint,
  budgetsHandler,
  TEST_BUDGET_ID,
  TEST_WALLET_TOKEN,
  withFamilyPeriod,
} from '../test/wallet.js';

/** Monday 2 November 2026, 10:00 in Sofia. */
const NOW = new Date('2026-11-02T08:00:00Z');

let app: FastifyInstance;

beforeAll(async () => {
  server.listen({ onUnhandledFrame: 'error' });
  app = buildTestApp({
    wallet: {
      client: createWalletClient(TEST_WALLET_TOKEN),
      budgetId: TEST_BUDGET_ID,
    },
    now: () => NOW,
  });
  await app.ready();
});

beforeEach(() => {
  server.use(budgetsHandler());
});

afterEach(() => server.resetHandlers());

afterAll(async () => {
  server.close();
  await app.close();
});

function syncNow() {
  return app.inject({
    method: 'POST',
    url: '/api/sync/budget',
    headers: { 'x-acting-user': DANI.id },
  });
}

describe('POST /api/sync/budget', () => {
  it('stores the current period of the family budget as a new snapshot', async () => {
    const response = await syncNow();

    expect(response.statusCode).toBe(200);
    expect(syncRunResultSchema.parse(response.json())).toMatchObject({
      source: 'budget',
      status: 'ok',
    });
    expect(await testDb().select().from(budgetSnapshot)).toEqual([
      expect.objectContaining({
        walletBudgetId: TEST_BUDGET_ID,
        name: 'Общ месечен бюджет',
        periodStart: '2026-11-01',
        periodEnd: '2026-11-30',
        limitAmount: 3200,
        spent: 412.35,
        remaining: 2787.65,
        currency: 'EUR',
        syncedAt: NOW,
      }),
    ]);
    expect(await testDb().select().from(syncRun)).toEqual([
      expect.objectContaining({ source: 'budget', status: 'ok', error: null }),
    ]);
  });

  it('adds a second snapshot on the next sync, keeping the first', async () => {
    await syncNow();
    server.use(
      budgetsHandler(withFamilyPeriod({ spent: 500, remaining: 2700 })),
    );

    const response = await syncNow();

    expect(response.json()).toMatchObject({ status: 'ok' });
    const rows = await testDb().select().from(budgetSnapshot);
    expect(rows.map((row) => [row.spent, row.remaining])).toEqual([
      [412.35, 2787.65],
      [500, 2700],
    ]);
  });

  it('fails the run without a new snapshot when Wallet refuses the token', async () => {
    let requests = 0;
    server.use(
      budgetsEndpoint(() => {
        requests++;
        return HttpResponse.json(
          { error: 'Invalid or expired token' },
          { status: 401 },
        );
      }),
    );

    const response = await syncNow();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      source: 'budget',
      status: 'failed',
      error: 'wallet_unauthorized',
    });
    expect(requests).toBe(1);
    expect(await testDb().select().from(budgetSnapshot)).toEqual([]);
    expect(await testDb().select().from(syncRun)).toEqual([
      expect.objectContaining({
        source: 'budget',
        status: 'failed',
        error: 'wallet_unauthorized',
      }),
    ]);
  });

  it('fails the run with budget_not_found when the token does not see the budget', async () => {
    const other = buildTestApp({
      wallet: {
        client: createWalletClient(TEST_WALLET_TOKEN),
        budgetId: 'test-budget-gone',
      },
      now: () => NOW,
    });
    try {
      const response = await other.inject({
        method: 'POST',
        url: '/api/sync/budget',
        headers: { 'x-acting-user': DANI.id },
      });

      expect(response.json()).toMatchObject({ status: 'failed' });
      expect(response.json().error).toContain('budget_not_found');
      expect(await testDb().select().from(budgetSnapshot)).toEqual([]);
      const [run] = await testDb().select().from(syncRun);
      expect(run?.status).toBe('failed');
      expect(run?.error).toContain('budget_not_found');
    } finally {
      await other.close();
    }
  });

  it('retries once when Wallet answers 5xx', async () => {
    let requests = 0;
    server.use(
      budgetsEndpoint(
        () => {
          requests++;
          return HttpResponse.json(
            { error: 'Internal Error' },
            { status: 503 },
          );
        },
        { once: true },
      ),
    );

    const response = await syncNow();

    expect(requests).toBe(1);
    expect(response.json()).toMatchObject({ status: 'ok' });
    expect(await testDb().select().from(budgetSnapshot)).toHaveLength(1);
  });

  it('gives up after the second 5xx', async () => {
    let requests = 0;
    server.use(
      budgetsEndpoint(() => {
        requests++;
        return HttpResponse.json({ error: 'Internal Error' }, { status: 502 });
      }),
    );

    const response = await syncNow();

    expect(requests).toBe(2);
    expect(response.json()).toMatchObject({ status: 'failed' });
    expect(await testDb().select().from(budgetSnapshot)).toEqual([]);
  });

  it('answers 202 running without starting a second sync while one is under way', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      budgetsEndpoint(
        async () => {
          await held;
          return HttpResponse.json(BUDGETS_CURRENT);
        },
        { once: true },
      ),
    );

    const first = syncNow();
    await vi.waitFor(async () => {
      expect(await testDb().select().from(syncRun)).toHaveLength(1);
    });
    const second = await syncNow();
    release();

    expect(second.statusCode).toBe(202);
    expect(second.json()).toEqual({ source: 'budget', status: 'running' });
    expect((await first).json()).toMatchObject({ status: 'ok' });
    expect(await testDb().select().from(syncRun)).toHaveLength(1);
  });

  it('answers unconfigured without Wallet config', async () => {
    const unconfigured = buildTestApp();
    try {
      const response = await unconfigured.inject({
        method: 'POST',
        url: '/api/sync/budget',
        headers: { 'x-acting-user': DANI.id },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        source: 'budget',
        status: 'unconfigured',
      });
      expect(await testDb().select().from(syncRun)).toEqual([]);
    } finally {
      await unconfigured.close();
    }
  });
});
