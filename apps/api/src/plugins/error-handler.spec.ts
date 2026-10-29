import { refusalSchema } from '@family/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ConflictError,
  InvalidReferenceError,
  NotFoundError,
  refuse,
} from '../services/errors.js';
import { buildTestApp } from '../test/app.js';
import { HttpError } from './error-handler.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = buildTestApp();
  // Test routes outside /api/ need neither Access nor an acting user, so only error handling is exercised.
  const test = app.withTypeProvider<ZodTypeProvider>();
  test.get('/test/boom', async () => {
    throw new Error('secret details');
  });
  test.get('/test/refused', async () => {
    throw new HttpError(403, 'forbidden', 'Нямаш достъп до това');
  });
  test.get('/test/unavailable', async () => {
    throw new HttpError(503, 'error', 'Календарът не отговаря, опитай пак');
  });
  test.get('/test/pool-down', async () => {
    throw Object.assign(new Error('pool exhausted at 10.0.0.5:5432'), {
      statusCode: 503,
      code: 'POOL_EXHAUSTED',
    });
  });
  // Like Fastify's own refusals (e.g. FST_ERR_CTP_INVALID_MEDIA_TYPE): a status and a code outside the contract.
  test.get('/test/teapot', async () => {
    throw Object.assign(new Error('Чайник съм'), {
      statusCode: 418,
      code: 'teapot',
    });
  });
  test.get('/test/missing', async () => {
    throw new NotFoundError('Няма такова нещо');
  });
  test.get('/test/clash', async () => {
    throw new ConflictError('Вече го има', { thing: { id: 1 } });
  });
  test.get('/test/dangling', async () => {
    throw new InvalidReferenceError('Сочи към нищо');
  });
  test.get('/test/no-plan', async () => {
    throw refuse('no_plan', 'Няма меню за тази седмица');
  });
  test.get('/test/cook-taken', async () => {
    throw refuse('cook_taken', 'Някой вече готви', {
      cookUserId: '00000000-0000-4000-8000-000000000001',
      cookName: 'Поли',
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

  it('answers an HttpError with its status, code and message', async () => {
    const response = await app.inject({ method: 'GET', url: '/test/refused' });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: 'forbidden',
      message: 'Нямаш достъп до това',
    });
  });

  it('keeps a 5xx status of an HttpError together with its code and message', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test/unavailable',
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: 'error',
      message: 'Календарът не отговаря, опитай пак',
    });
  });

  it('keeps a 5xx status of another error but tells nothing from it', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test/pool-down',
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: 'internal_error',
      message: 'Вътрешна грешка',
    });
    expect(response.body).not.toContain('10.0.0.5');
  });

  it('keeps the status and message of another error with a status, under the generic code error', async () => {
    const response = await app.inject({ method: 'GET', url: '/test/teapot' });

    expect(response.statusCode).toBe(418);
    expect(response.json()).toEqual({ error: 'error', message: 'Чайник съм' });
  });

  it.each([
    ['/test/missing', 404, { error: 'not_found', message: 'Няма такова нещо' }],
    [
      '/test/clash',
      409,
      { error: 'conflict', message: 'Вече го има', thing: { id: 1 } },
    ],
    [
      '/test/dangling',
      400,
      { error: 'invalid_reference', message: 'Сочи към нищо' },
    ],
  ])(
    'maps the service refusal from %s to %i with its code, message and details',
    async (url, status, body) => {
      const response = await app.inject({ method: 'GET', url });

      expect(response.statusCode).toBe(status);
      expect(response.json()).toEqual(body);
    },
  );

  it.each([
    [
      '/test/no-plan',
      404,
      {
        error: 'not_found',
        code: 'no_plan',
        message: 'Няма меню за тази седмица',
      },
    ],
    [
      '/test/cook-taken',
      409,
      {
        error: 'conflict',
        code: 'cook_taken',
        message: 'Някой вече готви',
        cookUserId: '00000000-0000-4000-8000-000000000001',
        cookName: 'Поли',
      },
    ],
  ])(
    'answers a refusal with a sub-code from %s with %i, its error, code, message and details',
    async (url, status, body) => {
      const response = await app.inject({ method: 'GET', url });

      expect(response.statusCode).toBe(status);
      expect(response.json()).toEqual(body);
      expect(refusalSchema.parse(response.json())).toEqual(body);
    },
  );

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

// Checked by `tsc`, never run: a sub-code outside `refusalSchemas` or details that do not match it do not compile.
function refusalsThatDoNotCompile(): void {
  // @ts-expect-error: no such sub-code
  refuse('no_plann', 'Няма меню');
  // @ts-expect-error: `not_enough_recipes` carries `have` and `need`
  refuse('not_enough_recipes', 'Малко рецепти');
  // @ts-expect-error: `need` is missing
  refuse('not_enough_recipes', 'Малко рецепти', { have: 3 });
  // @ts-expect-error: `no_plan` carries no details
  refuse('no_plan', 'Няма меню', { have: 3 });
}
void refusalsThatDoNotCompile;
