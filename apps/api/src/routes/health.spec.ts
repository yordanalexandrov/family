import { healthSchema } from '@family/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';

describe('GET /healthz', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports the api is up with the database check skipped', async () => {
    const response = await app.inject({ method: 'GET', url: '/healthz' });

    expect(response.statusCode).toBe(200);
    expect(healthSchema.parse(response.json())).toEqual({
      status: 'ok',
      db: 'skipped',
    });
  });
});
