import { usersResponseSchema } from '@family/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { TEST_DATABASE_URL } from '../test/db.js';
import { DANI, POLI } from '../test/users.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp({ databaseUrl: TEST_DATABASE_URL });
  await app.ready();
});

afterAll(() => app.close());

describe('GET /api/users', () => {
  it('lists both users ordered by name without an acting user header', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/users' });

    expect(response.statusCode).toBe(200);
    expect(usersResponseSchema.parse(response.json())).toEqual({
      users: [DANI, POLI],
    });
  });
});
