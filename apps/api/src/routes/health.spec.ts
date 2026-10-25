import { healthSchema } from '@family/shared';
import { describe, expect, it } from 'vitest';
import { createWalletClient } from '../integrations/wallet/client.js';
import { buildTestApp } from '../test/app.js';
import { TEST_DATABASE_URL } from '../test/db.js';
import { server } from '../test/msw.js';
import { DANI } from '../test/users.js';
import {
  budgetsEndpoint,
  TEST_BUDGET_ID,
  TEST_WALLET_TOKEN,
} from '../test/wallet.js';

async function getHealth(databaseUrl: string) {
  const app = buildTestApp({ databaseUrl });
  await app.ready();
  try {
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    return { status: response.statusCode, body: response.json() };
  } finally {
    await app.close();
  }
}

describe('GET /healthz', () => {
  it('reports ok when the database answers', async () => {
    const { status, body } = await getHealth(TEST_DATABASE_URL);

    expect(status).toBe(200);
    expect(healthSchema.parse(body)).toEqual({
      status: 'ok',
      db: 'ok',
      sync: { calendar: 'unconfigured', budget: 'unconfigured' },
    });
  });

  it('reports how fresh each source is and stays 200 when a sync failed', async () => {
    const app = buildTestApp({
      wallet: {
        client: createWalletClient(TEST_WALLET_TOKEN),
        budgetId: TEST_BUDGET_ID,
      },
    });
    server.listen({ onUnhandledFrame: 'error' });
    server.use(
      budgetsEndpoint(() =>
        Response.json({ error: 'Invalid or expired token' }, { status: 401 }),
      ),
    );
    try {
      await app.ready();
      const sync = await app.inject({
        method: 'POST',
        url: '/api/sync/budget',
        headers: { 'x-acting-user': DANI.id },
      });
      expect(sync.json()).toMatchObject({ status: 'failed' });

      const response = await app.inject({ method: 'GET', url: '/healthz' });

      expect(response.statusCode).toBe(200);
      expect(healthSchema.parse(response.json())).toEqual({
        status: 'ok',
        db: 'ok',
        sync: { calendar: 'unconfigured', budget: 'failed' },
      });
    } finally {
      server.close();
      await app.close();
    }
  });

  it('reports degraded with 503 when the database is unreachable', async () => {
    // Nothing listens on port 1, so the connection is refused at once.
    const { status, body } = await getHealth(
      'postgres://family:test@127.0.0.1:1/family',
    );

    expect(status).toBe(503);
    expect(healthSchema.parse(body)).toEqual({
      status: 'degraded',
      db: 'down',
    });
  });
});
