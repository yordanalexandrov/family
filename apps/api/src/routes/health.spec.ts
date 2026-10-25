import { healthSchema } from '@family/shared';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../test/app.js';
import { TEST_DATABASE_URL } from '../test/db.js';

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
    expect(healthSchema.parse(body)).toEqual({ status: 'ok', db: 'ok' });
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
