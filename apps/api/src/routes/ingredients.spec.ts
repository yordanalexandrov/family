import {
  ingredientResponseSchema,
  ingredientsResponseSchema,
} from '@family/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from '../test/app.js';
import { DANI } from '../test/users.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = buildTestApp();
  await app.ready();
});

afterAll(() => app.close());

const headers = { 'x-acting-user': DANI.id };

describe('GET /api/ingredients', () => {
  it('finds ingredients whose name contains q, ignoring case, ordered by name', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/ingredients?q=${encodeURIComponent('КАРТОФ')}`,
      headers,
    });

    expect(response.statusCode).toBe(200);
    const { ingredients } = ingredientsResponseSchema.parse(response.json());
    expect(ingredients.map((ingredient) => ingredient.name)).toEqual([
      'картоф',
      'сладък картоф',
    ]);
    expect(ingredients[0]).toMatchObject({ unit: 'g', aisle: 'produce' });
  });

  it('puts the exact match first, so the 50-row cap cannot push it out', async () => {
    // 60 names that contain „мед“ and sort before it.
    for (let index = 0; index < 60; index += 1) {
      const response = await createIngredient({
        name: `а${String(index).padStart(2, '0')} мед`,
        unit: 'g',
        aisle: 'other',
      });
      expect(response.statusCode).toBe(201);
    }
    await createIngredient({ name: 'мед', unit: 'g', aisle: 'other' });

    const response = await app.inject({
      method: 'GET',
      url: `/api/ingredients?q=${encodeURIComponent(' Мед ')}`,
      headers,
    });

    const { ingredients } = ingredientsResponseSchema.parse(response.json());
    expect(ingredients).toHaveLength(50);
    expect(ingredients[0]?.name).toBe('мед');
    expect(ingredients[1]?.name).toBe('а00 мед');
  });
});

function createIngredient(payload: object) {
  return app.inject({
    method: 'POST',
    url: '/api/ingredients',
    headers,
    payload,
  });
}

describe('POST /api/ingredients', () => {
  it('creates an ingredient under its canonical name and finds it afterwards', async () => {
    const response = await createIngredient({
      name: '  Пресен   ДЖОДЖЕН ',
      unit: 'g',
      aisle: 'produce',
    });

    expect(response.statusCode).toBe(201);
    const { ingredient } = ingredientResponseSchema.parse(response.json());
    expect(ingredient).toEqual({
      id: expect.any(String),
      name: 'пресен джоджен',
      unit: 'g',
      aisle: 'produce',
    });

    const search = await app.inject({
      method: 'GET',
      url: `/api/ingredients?q=${encodeURIComponent('джоджен')}`,
      headers,
    });
    expect(search.json()).toEqual({ ingredients: [ingredient] });
  });

  it('answers 409 conflict with the existing ingredient when the name differs only in case', async () => {
    const response = await createIngredient({
      name: 'Картоф',
      unit: 'pcs',
      aisle: 'other',
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: 'conflict',
      message: expect.any(String),
      ingredient: {
        id: expect.any(String),
        name: 'картоф',
        unit: 'g',
        aisle: 'produce',
      },
    });
  });
});

async function findIngredient(name: string) {
  const response = await app.inject({
    method: 'GET',
    url: `/api/ingredients?q=${encodeURIComponent(name)}`,
    headers,
  });
  const { ingredients } = ingredientsResponseSchema.parse(response.json());
  const found = ingredients.find((ingredient) => ingredient.name === name);
  if (!found) {
    throw new Error(`no seed ingredient ${name}`);
  }
  return found;
}

function patchIngredient(id: string, payload: object) {
  return app.inject({
    method: 'PATCH',
    url: `/api/ingredients/${id}`,
    headers,
    payload,
  });
}

describe('PATCH /api/ingredients/:id', () => {
  it('renames an ingredient to its canonical name and keeps the other fields', async () => {
    const potato = await findIngredient('картоф');

    const response = await patchIngredient(potato.id, { name: ' Бял  Картоф' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ingredient: { ...potato, name: 'бял картоф' },
    });
    expect(await findIngredient('бял картоф')).toEqual({
      ...potato,
      name: 'бял картоф',
    });
  });

  it('changes the aisle and unit', async () => {
    const potato = await findIngredient('картоф');

    const response = await patchIngredient(potato.id, {
      unit: 'pcs',
      aisle: 'other',
    });

    expect(response.json()).toEqual({
      ingredient: { ...potato, unit: 'pcs', aisle: 'other' },
    });
  });

  it('answers 409 conflict with the existing ingredient when renamed to a taken name', async () => {
    const potato = await findIngredient('картоф');
    const onion = await findIngredient('лук');

    const response = await patchIngredient(potato.id, { name: 'ЛУК' });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: 'conflict',
      message: expect.any(String),
      ingredient: onion,
    });
  });

  it('answers 404 not_found for an unknown id', async () => {
    const response = await patchIngredient(
      '99999999-9999-4999-8999-999999999999',
      { name: 'нещо' },
    );

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: 'not_found' });
  });
});
