import {
  type Ingredient,
  ingredientResponseSchema,
  ingredientsResponseSchema,
  type PantryItem,
  pantryItemResponseSchema,
  pantryResponseSchema,
  type ServerEvent,
} from '@family/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ingredient as ingredientTable } from '../db/schema/food.js';
import { pantryItem } from '../db/schema/pantry.js';
import { buildTestApp } from '../test/app.js';
import { DANI } from '../test/users.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = buildTestApp();
  await app.ready();
});

afterAll(() => app.close());

const headers = { 'x-acting-user': DANI.id };
const UNKNOWN_ID = '99999999-9999-4999-8999-999999999999';

function inject(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
) {
  return app.inject({
    method,
    url,
    headers,
    ...(payload ? { payload } : {}),
  });
}

/** A seed ingredient by its canonical name. */
async function seedIngredient(name: string): Promise<Ingredient> {
  const response = await inject(
    'GET',
    `/api/ingredients?q=${encodeURIComponent(name)}`,
  );
  const found = ingredientsResponseSchema
    .parse(response.json())
    .ingredients.find((ingredient) => ingredient.name === name);
  if (!found) {
    throw new Error(`no seed ingredient ${name}`);
  }
  return found;
}

async function add(
  ingredientId: string,
  kind: 'staple' | 'use_up',
  note?: string,
): Promise<PantryItem> {
  const response = await inject('POST', '/api/pantry', {
    ingredientId,
    kind,
    ...(note === undefined ? {} : { note }),
  });
  expect(response.statusCode).toBe(201);
  return pantryItemResponseSchema.parse(response.json()).item;
}

async function pantry(): Promise<PantryItem[]> {
  const response = await inject('GET', '/api/pantry');
  expect(response.statusCode).toBe(200);
  return pantryResponseSchema.parse(response.json()).items;
}

/** The signals published while `act` runs. */
async function signalsOf(act: () => Promise<unknown>): Promise<ServerEvent[]> {
  const signals: ServerEvent[] = [];
  const unsubscribe = app.events.subscribe((event) => signals.push(event));
  try {
    await act();
  } finally {
    unsubscribe();
  }
  return signals;
}

describe('GET /api/pantry', () => {
  it('is empty before anything is added', async () => {
    expect(await pantry()).toEqual([]);
  });

  it('lists staples first by name, then use-up items oldest first', async () => {
    const rice = await seedIngredient('ориз');
    const salt = await seedIngredient('сол');
    const cheese = await seedIngredient('сирене');
    const yellowCheese = await seedIngredient('кашкавал');
    await add(salt.id, 'staple');
    await add(yellowCheese.id, 'use_up', 'отворен');
    await add(rice.id, 'staple');
    await add(cheese.id, 'use_up');

    expect(
      (await pantry()).map((item) => [item.kind, item.ingredient.name]),
    ).toEqual([
      ['staple', 'ориз'],
      ['staple', 'сол'],
      ['use_up', 'кашкавал'],
      ['use_up', 'сирене'],
    ]);
  });
});

describe('POST /api/pantry', () => {
  it('adds an ingredient with its kind and note, and answers the item', async () => {
    const cheese = await seedIngredient('сирене');

    const item = await add(cheese.id, 'use_up', '  хладилник, ~300 г ');

    expect(item).toMatchObject({
      ingredient: { id: cheese.id, name: 'сирене', aisle: cheese.aisle },
      kind: 'use_up',
      note: 'хладилник, ~300 г',
      ranOutAt: null,
    });
    expect(await pantry()).toEqual([item]);
  });

  it('answers 409 already_in_pantry for an ingredient that is in the pantry, and keeps the first', async () => {
    const salt = await seedIngredient('сол');
    const first = await add(salt.id, 'staple');

    const response = await inject('POST', '/api/pantry', {
      ingredientId: salt.id,
      kind: 'use_up',
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: 'conflict',
      code: 'already_in_pantry',
    });
    expect(await pantry()).toEqual([first]);
  });

  it('answers 400 invalid_reference for an unknown ingredient', async () => {
    const response = await inject('POST', '/api/pantry', {
      ingredientId: UNKNOWN_ID,
      kind: 'staple',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'invalid_reference' });
  });
});

describe('PATCH /api/pantry/:id', () => {
  it('turns a staple into a use-up item with a note, and back', async () => {
    const rice = await seedIngredient('ориз');
    const item = await add(rice.id, 'staple');

    const changed = await inject('PATCH', `/api/pantry/${item.id}`, {
      kind: 'use_up',
      note: 'отворен пакет',
    });

    expect(changed.statusCode).toBe(200);
    expect(pantryItemResponseSchema.parse(changed.json()).item).toMatchObject({
      kind: 'use_up',
      note: 'отворен пакет',
    });

    const back = await inject('PATCH', `/api/pantry/${item.id}`, {
      kind: 'staple',
      note: null,
    });
    expect(pantryItemResponseSchema.parse(back.json()).item).toMatchObject({
      kind: 'staple',
      note: null,
    });
  });

  it('a staple that ran out and becomes a use-up item no longer ran out', async () => {
    const salt = await seedIngredient('сол');
    const item = await add(salt.id, 'staple');
    // „Свърши“ comes with the shopping list (#91); until then the flag is set in the table.
    await app.db
      .update(pantryItem)
      .set({ ranOutAt: new Date('2026-10-20T08:00:00Z') })
      .where(eq(pantryItem.id, item.id));

    const response = await inject('PATCH', `/api/pantry/${item.id}`, {
      kind: 'use_up',
    });

    expect(response.statusCode).toBe(200);
    expect(pantryItemResponseSchema.parse(response.json()).item).toMatchObject({
      kind: 'use_up',
      ranOutAt: null,
    });
  });

  it('answers 404 for an item that is not in the pantry', async () => {
    const response = await inject('PATCH', `/api/pantry/${UNKNOWN_ID}`, {
      kind: 'staple',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: 'not_found' });
  });
});

describe('DELETE /api/pantry/:id', () => {
  it('takes the item out of the pantry („Използвано“)', async () => {
    const cheese = await seedIngredient('сирене');
    const salt = await seedIngredient('сол');
    const used = await add(cheese.id, 'use_up');
    const kept = await add(salt.id, 'staple');

    const response = await inject('DELETE', `/api/pantry/${used.id}`);

    expect(response.statusCode).toBe(204);
    expect(await pantry()).toEqual([kept]);
  });

  it('answers 404 for an item that is not in the pantry', async () => {
    const response = await inject('DELETE', `/api/pantry/${UNKNOWN_ID}`);

    expect(response.statusCode).toBe(404);
  });
});

describe('pantry and ingredients', () => {
  it('an ingredient that is deleted leaves the pantry with it', async () => {
    const created = await inject('POST', '/api/ingredients', {
      name: 'кайма',
      unit: 'g',
      aisle: 'meat',
    });
    const mince = ingredientResponseSchema.parse(created.json()).ingredient;
    await add(mince.id, 'use_up', 'фризер');

    // No route deletes an ingredient; the cascade is the database's.
    await app.db
      .delete(ingredientTable)
      .where(eq(ingredientTable.id, mince.id));

    expect(await pantry()).toEqual([]);
  });
});

describe('pantry signals', () => {
  it('signals shopping.changed for every week after an add, a change and a removal', async () => {
    const rice = await seedIngredient('ориз');

    const signals = await signalsOf(async () => {
      const item = await add(rice.id, 'staple');
      await inject('PATCH', `/api/pantry/${item.id}`, { kind: 'use_up' });
      await inject('DELETE', `/api/pantry/${item.id}`);
    });

    expect(signals).toEqual([
      { type: 'shopping.changed' },
      { type: 'shopping.changed' },
      { type: 'shopping.changed' },
    ]);
  });

  it('signals nothing for a refused change', async () => {
    const rice = await seedIngredient('ориз');
    await add(rice.id, 'staple');

    const signals = await signalsOf(async () => {
      await inject('POST', '/api/pantry', {
        ingredientId: rice.id,
        kind: 'staple',
      });
      await inject('PATCH', `/api/pantry/${UNKNOWN_ID}`, { kind: 'staple' });
      await inject('DELETE', `/api/pantry/${UNKNOWN_ID}`);
    });

    expect(signals).toEqual([]);
  });
});
