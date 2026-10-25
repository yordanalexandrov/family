import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApp } from '../app.js';
import { TEST_DATABASE_URL } from '../test/db.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp({ databaseUrl: TEST_DATABASE_URL });
  // Test routes outside /api/ need neither Access nor an acting user, so only error handling is exercised.
  const test = app.withTypeProvider<ZodTypeProvider>();
  test.get('/test/boom', async () => {
    throw new Error('secret details');
  });
  test.get('/test/teapot', async () => {
    throw Object.assign(new Error('Чайник съм'), {
      statusCode: 418,
      code: 'teapot',
    });
  });
  test.get(
    '/test/validated',
    { schema: { querystring: z.object({ n: z.coerce.number().int() }) } },
    async (request) => ({ n: request.query.n }),
  );
  await app.ready();
});

afterAll(() => app.close());

describe('error handler', () => {
  it('answers 500 with a generic Bulgarian message and nothing from the error itself', async () => {
    const response = await app.inject({ method: 'GET', url: '/test/boom' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: 'internal_error',
      message: 'Вътрешна грешка',
    });
    expect(response.body).not.toContain('secret details');
    expect(response.body).not.toContain('stack');
  });

  it('keeps the status and code of an error that carries them', async () => {
    const response = await app.inject({ method: 'GET', url: '/test/teapot' });

    expect(response.statusCode).toBe(418);
    expect(response.json()).toEqual({ error: 'teapot', message: 'Чайник съм' });
  });

  it('answers 400 validation_error with the offending paths when the query does not match its schema', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test/validated?n=abc',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'validation_error',
      message: expect.any(String),
      issues: [{ path: 'n', message: expect.any(String) }],
    });
  });

  it('coerces a valid query through the route schema', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test/validated?n=5',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ n: 5 });
  });

  it('answers 404 not_found for an unknown route', async () => {
    const response = await app.inject({ method: 'GET', url: '/nope' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: 'not_found',
      message: expect.any(String),
    });
  });
});
