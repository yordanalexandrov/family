import { meResponseSchema } from '@family/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { TEST_DATABASE_URL } from '../test/db.js';
import { DANI } from '../test/seed.js';

const DEV_EMAIL = 'dev@example.com';

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp({
    databaseUrl: TEST_DATABASE_URL,
    auth: { mode: 'dev', email: DEV_EMAIL },
  });
  await app.ready();
});

afterAll(() => app.close());

function getMe(actingUser?: string) {
  return app.inject({
    method: 'GET',
    url: '/api/me',
    headers: actingUser === undefined ? {} : { 'x-acting-user': actingUser },
  });
}

describe('acting user (X-Acting-User)', () => {
  it('answers 400 missing_acting_user when the header is absent', async () => {
    const response = await getMe();

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'missing_acting_user' });
  });

  it('answers 400 unknown_acting_user when the header is not a UUID', async () => {
    const response = await getMe('dani');

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'unknown_acting_user' });
  });

  it('answers 400 unknown_acting_user when no user has that id', async () => {
    const response = await getMe('99999999-9999-4999-8999-999999999999');

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'unknown_acting_user' });
  });

  it('GET /api/me returns the acting user together with the Access e-mail', async () => {
    const response = await getMe(DANI.id);

    expect(response.statusCode).toBe(200);
    expect(meResponseSchema.parse(response.json())).toEqual({
      user: DANI,
      accessEmail: DEV_EMAIL,
    });
  });
});
