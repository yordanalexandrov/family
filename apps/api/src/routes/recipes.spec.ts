import {
  type Ingredient,
  ingredientsResponseSchema,
  type RecipeInput,
  recipeResponseSchema,
  recipesResponseSchema,
  type ServerEvent,
} from '@family/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from '../test/app.js';
import { storedStepPhoto } from '../test/photos.js';
import { DANI } from '../test/users.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = buildTestApp();
  await app.ready();
});

afterAll(() => app.close());

const headers = { 'x-acting-user': DANI.id };

/** A seed ingredient, looked up through the API. */
async function seedIngredient(name: string): Promise<Ingredient> {
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

function recipeInput(overrides: Partial<RecipeInput> = {}): RecipeInput {
  return {
    title: 'Печени картофи',
    servings: 4,
    steps: [
      { text: 'Нарежи картофите.' },
      { text: 'Печи 40 минути на 200 °C.' },
    ],
    tags: ['dinner'],
    preparation: [],
    ingredients: [],
    ...overrides,
  };
}

function createRecipe(payload: object) {
  return app.inject({ method: 'POST', url: '/api/recipes', headers, payload });
}

async function createdRecipe(payload: RecipeInput) {
  const response = await createRecipe(payload);
  expect(response.statusCode).toBe(201);
  return recipeResponseSchema.parse(response.json()).recipe;
}

function getRecipe(id: string) {
  return app.inject({ method: 'GET', url: `/api/recipes/${id}`, headers });
}

describe('POST /api/recipes', () => {
  it('creates a recipe with two ingredients and reads it back with their names, units and aisles', async () => {
    const potato = await seedIngredient('картоф');
    const salt = await seedIngredient('сол');

    const created = await createdRecipe(
      recipeInput({
        sourceUrl: 'https://recepti.example/pecheni-kartofi',
        prepMinutes: 50,
        nutritionPer100g: { kcal: 120, proteinG: 2, fatG: 5, carbsG: 17 },
        ingredients: [
          { ingredientId: potato.id, quantity: 1.5, unit: 'kg' },
          {
            ingredientId: salt.id,
            quantity: null,
            unit: 'pinch',
            note: 'морска',
          },
        ],
      }),
    );

    const response = await getRecipe(created.id);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      recipe: {
        id: created.id,
        title: 'Печени картофи',
        servings: 4,
        steps: [
          { text: 'Нарежи картофите.' },
          { text: 'Печи 40 минути на 200 °C.' },
        ],
        sourceUrl: 'https://recepti.example/pecheni-kartofi',
        prepMinutes: 50,
        tags: ['dinner'],
        nutritionPer100g: { kcal: 120, proteinG: 2, fatG: 5, carbsG: 17 },
        preparation: [],
        ingredients: [
          {
            ingredientId: potato.id,
            quantity: 1.5,
            unit: 'kg',
            ingredient: potato,
          },
          {
            ingredientId: salt.id,
            quantity: null,
            unit: 'pinch',
            note: 'морска',
            ingredient: salt,
          },
        ],
        archivedAt: null,
        rating: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        openRevision: null,
      },
    });
    expect(created).toEqual(response.json().recipe);
  });

  it('answers 400 invalid_reference for an unknown ingredientId and creates nothing', async () => {
    const response = await createRecipe(
      recipeInput({
        ingredients: [
          {
            ingredientId: '99999999-9999-4999-8999-999999999999',
            quantity: 1,
            unit: 'pcs',
          },
        ],
      }),
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'invalid_reference',
      message: expect.any(String),
    });
    expect(await listTitles('')).toEqual([]);
  });

  it('keeps the photo of a step', async () => {
    const photoId = await storedStepPhoto(app);

    const created = await createdRecipe(
      recipeInput({
        steps: [{ text: 'Нарежи картофите.', photoId }, { text: 'Печи.' }],
      }),
    );

    expect(created.steps).toEqual([
      { text: 'Нарежи картофите.', photoId },
      { text: 'Печи.' },
    ]);
  });

  it('answers 400 invalid_reference for a step with an unknown photo and creates nothing', async () => {
    const response = await createRecipe(
      recipeInput({
        steps: [
          {
            text: 'Нарежи картофите.',
            photoId: '99999999-9999-4999-8999-999999999999',
          },
        ],
      }),
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'invalid_reference' });
    expect(await listTitles('')).toEqual([]);
  });

  it('keeps the preparation in its order and reads it back', async () => {
    const preparation: RecipeInput['preparation'] = [
      { kind: 'soak', text: 'накисни боба', minutesBefore: 720 },
      { kind: 'oven', degrees: 200, fan: 'fan', rack: 'middle' },
      { kind: 'pan', text: 'намажи тавата' },
    ];

    const created = await createdRecipe(recipeInput({ preparation }));

    expect(created.preparation).toEqual(preparation);
    const read = recipeResponseSchema.parse(
      (await getRecipe(created.id)).json(),
    ).recipe;
    expect(read.preparation).toEqual(preparation);
  });

  it('a recipe sent without preparation (an older client) has an empty one', async () => {
    const { preparation: _none, ...withoutPreparation } = recipeInput();

    const response = await createRecipe(withoutPreparation);

    expect(response.statusCode).toBe(201);
    const { id } = recipeResponseSchema.parse(response.json()).recipe;
    expect(
      recipeResponseSchema.parse((await getRecipe(id)).json()).recipe
        .preparation,
    ).toEqual([]);
  });

  it('answers 400 validation_error for two ovens and creates nothing', async () => {
    const response = await createRecipe(
      recipeInput({
        preparation: [
          { kind: 'oven', degrees: 200, fan: 'fan' },
          { kind: 'oven', degrees: 180, fan: 'conventional' },
        ],
      }),
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'validation_error' });
    expect(await listTitles('')).toEqual([]);
  });

  it('answers 400 validation_error for a recipe without steps', async () => {
    const response = await createRecipe(recipeInput({ steps: [] }));

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'validation_error' });
  });

  it('answers 400 validation_error for steps of text instead of step objects', async () => {
    const response = await createRecipe({
      ...recipeInput(),
      steps: ['Нарежи картофите.'],
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'validation_error' });
  });
});

async function listTitles(query: string) {
  const response = await app.inject({
    method: 'GET',
    url: `/api/recipes${query}`,
    headers,
  });
  expect(response.statusCode).toBe(200);
  return recipesResponseSchema
    .parse(response.json())
    .recipes.map((recipe) => recipe.title);
}

function archive(id: string, action: 'archive' | 'unarchive' = 'archive') {
  return app.inject({
    method: 'POST',
    url: `/api/recipes/${id}/${action}`,
    headers,
  });
}

describe('GET /api/recipes', () => {
  it('lists summaries ordered by title', async () => {
    const created = await createdRecipe(
      recipeInput({ title: 'Таратор', prepMinutes: 10, tags: ['lunch'] }),
    );
    await createdRecipe(recipeInput({ title: 'Боб чорба' }));

    const response = await app.inject({
      method: 'GET',
      url: '/api/recipes',
      headers,
    });

    expect(response.json().recipes).toEqual([
      expect.objectContaining({ title: 'Боб чорба' }),
      {
        id: created.id,
        title: 'Таратор',
        servings: 4,
        prepMinutes: 10,
        tags: ['lunch'],
        archivedAt: null,
        rating: null,
        openRevision: null,
      },
    ]);
  });

  it('sort=rating lists the best rated first and the unrated last, by title within a rating', async () => {
    const rated = async (title: string, rating: number | null) => {
      const created = await createdRecipe(recipeInput({ title }));
      if (rating !== null) {
        await rate(created.id, rating);
      }
    };
    await rated('Боб чорба', null);
    await rated('Мусака', 3);
    await rated('Таратор', 5);
    await rated('Гювеч', 3);

    const response = await app.inject({
      method: 'GET',
      url: '/api/recipes?sort=rating',
      headers,
    });

    expect(
      recipesResponseSchema
        .parse(response.json())
        .recipes.map((recipe) => [recipe.title, recipe.rating]),
    ).toEqual([
      ['Таратор', 5],
      ['Гювеч', 3],
      ['Мусака', 3],
      ['Боб чорба', null],
    ]);
  });

  it('finds recipes whose title contains q, ignoring case', async () => {
    await createdRecipe(recipeInput({ title: 'Пилешка супа' }));
    await createdRecipe(recipeInput({ title: 'Пиле с ориз' }));
    await createdRecipe(recipeInput({ title: 'Мусака' }));

    expect(await listTitles(`?q=${encodeURIComponent('ПИЛЕ')}`)).toEqual([
      'Пиле с ориз',
      'Пилешка супа',
    ]);
  });

  it('keeps only recipes with the given tag', async () => {
    await createdRecipe(recipeInput({ title: 'Мюсли', tags: ['breakfast'] }));
    await createdRecipe(
      recipeInput({ title: 'Палачинки', tags: ['breakfast', 'kid_friendly'] }),
    );
    await createdRecipe(recipeInput({ title: 'Мусака', tags: ['dinner'] }));

    expect(await listTitles('?tag=kid_friendly')).toEqual(['Палачинки']);
    expect(await listTitles('?tag=breakfast')).toEqual(['Мюсли', 'Палачинки']);
  });

  it('several tags: any of the slots and all of the other tags', async () => {
    await createdRecipe(
      recipeInput({ title: 'Леща', tags: ['lunch', 'kid_friendly'] }),
    );
    await createdRecipe(
      recipeInput({ title: 'Мусака', tags: ['dinner', 'kid_friendly'] }),
    );
    await createdRecipe(recipeInput({ title: 'Таратор', tags: ['lunch'] }));
    await createdRecipe(
      recipeInput({ title: 'Мюсли', tags: ['breakfast', 'kid_friendly'] }),
    );
    await createdRecipe(
      recipeInput({
        title: 'Кюфтета',
        tags: ['dinner', 'kid_friendly', 'batch'],
      }),
    );

    expect(await listTitles('?tag=lunch&tag=dinner')).toEqual([
      'Кюфтета',
      'Леща',
      'Мусака',
      'Таратор',
    ]);
    expect(await listTitles('?tag=lunch&tag=dinner&tag=kid_friendly')).toEqual([
      'Кюфтета',
      'Леща',
      'Мусака',
    ]);
    expect(await listTitles('?tag=kid_friendly&tag=batch')).toEqual([
      'Кюфтета',
    ]);
  });

  it('keeps recipes whose prep time is in any of the intervals', async () => {
    await createdRecipe(recipeInput({ title: 'Таратор', prepMinutes: 15 }));
    await createdRecipe(recipeInput({ title: 'Омлет', prepMinutes: 16 }));
    await createdRecipe(recipeInput({ title: 'Леща', prepMinutes: 40 }));
    await createdRecipe(recipeInput({ title: 'Мусака', prepMinutes: 90 }));
    await createdRecipe(recipeInput({ title: 'Без време' }));

    expect(await listTitles('?time=0-15')).toEqual(['Таратор']);
    expect(await listTitles('?time=0-15&time=30-45')).toEqual([
      'Леща',
      'Таратор',
    ]);
    expect(await listTitles('?time=60%2B')).toEqual(['Мусака']);
    const invalid = await app.inject({
      method: 'GET',
      url: '/api/recipes?time=10-20',
      headers,
    });
    expect(invalid.statusCode).toBe(400);
  });

  it('hides archived recipes unless includeArchived=true', async () => {
    const old = await createdRecipe(recipeInput({ title: 'Стара рецепта' }));
    await createdRecipe(recipeInput({ title: 'Нова рецепта' }));
    expect((await archive(old.id)).statusCode).toBe(200);

    expect(await listTitles('')).toEqual(['Нова рецепта']);
    expect(await listTitles('?includeArchived=false')).toEqual([
      'Нова рецепта',
    ]);
    expect(await listTitles('?includeArchived=true')).toEqual([
      'Нова рецепта',
      'Стара рецепта',
    ]);
  });
});

describe('GET /api/recipes/:id', () => {
  it('answers 404 not_found for an unknown id', async () => {
    const response = await getRecipe('99999999-9999-4999-8999-999999999999');

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: 'not_found',
      message: 'Няма такава рецепта',
    });
  });

  it('opens a recipe without an acting user (kiosk), but refuses to change it', async () => {
    const recipe = await createdRecipe(recipeInput({ title: 'Мусака' }));

    const read = await app.inject({
      method: 'GET',
      url: `/api/recipes/${recipe.id}`,
    });
    const change = await app.inject({
      method: 'PUT',
      url: `/api/recipes/${recipe.id}`,
      payload: recipeInput({ title: 'Мусака с тиквички' }),
    });

    expect(read.statusCode).toBe(200);
    expect(read.json()).toEqual({ recipe });
    expect(change.statusCode).toBe(400);
    expect(change.json()).toMatchObject({ error: 'missing_acting_user' });
  });

  it('lists and searches the registry without an acting user (kiosk), but refuses to create', async () => {
    await createdRecipe(recipeInput({ title: 'Мусака' }));
    await createdRecipe(recipeInput({ title: 'Пиле с ориз' }));

    const list = await app.inject({
      method: 'GET',
      url: `/api/recipes?q=${encodeURIComponent('мус')}`,
    });
    const create = await app.inject({
      method: 'POST',
      url: '/api/recipes',
      payload: recipeInput({ title: 'Боб' }),
    });

    expect(list.statusCode).toBe(200);
    expect(list.json().recipes.map((r: { title: string }) => r.title)).toEqual([
      'Мусака',
    ]);
    expect(create.statusCode).toBe(400);
    expect(create.json()).toMatchObject({ error: 'missing_acting_user' });
  });
});

describe('PUT /api/recipes/:id', () => {
  it('replaces the recipe and its whole ingredient list', async () => {
    const potato = await seedIngredient('картоф');
    const salt = await seedIngredient('сол');
    const onion = await seedIngredient('лук');
    const created = await createdRecipe(
      recipeInput({
        prepMinutes: 50,
        ingredients: [
          { ingredientId: potato.id, quantity: 1, unit: 'kg' },
          { ingredientId: salt.id, quantity: null, unit: 'pinch' },
        ],
      }),
    );

    const response = await app.inject({
      method: 'PUT',
      url: `/api/recipes/${created.id}`,
      headers,
      payload: recipeInput({
        title: 'Картофи с лук',
        servings: 2,
        ingredients: [
          { ingredientId: onion.id, quantity: 2, unit: 'pcs', note: 'червен' },
          { ingredientId: potato.id, quantity: 500, unit: 'g' },
        ],
      }),
    });

    expect(response.statusCode).toBe(200);
    const { recipe } = recipeResponseSchema.parse(response.json());
    expect(recipe).toMatchObject({
      id: created.id,
      title: 'Картофи с лук',
      servings: 2,
      createdAt: created.createdAt,
    });
    expect(recipe.prepMinutes).toBeUndefined();
    expect(recipe.ingredients).toEqual([
      {
        ingredientId: onion.id,
        quantity: 2,
        unit: 'pcs',
        note: 'червен',
        ingredient: onion,
      },
      { ingredientId: potato.id, quantity: 500, unit: 'g', ingredient: potato },
    ]);
    expect((await getRecipe(created.id)).json()).toEqual({ recipe });
  });

  it('changes and clears the preparation', async () => {
    const created = await createdRecipe(
      recipeInput({
        preparation: [{ kind: 'oven', degrees: 200, fan: 'fan' }],
      }),
    );
    const put = async (preparation: RecipeInput['preparation']) => {
      const response = await app.inject({
        method: 'PUT',
        url: `/api/recipes/${created.id}`,
        headers,
        payload: recipeInput({ preparation }),
      });
      expect(response.statusCode).toBe(200);
      return recipeResponseSchema.parse(response.json()).recipe.preparation;
    };

    const changed: RecipeInput['preparation'] = [
      { kind: 'fridge', text: 'извади маслото', minutesBefore: 60 },
      { kind: 'oven', degrees: 180, fan: 'conventional', rack: 'low' },
    ];
    expect(await put(changed)).toEqual(changed);
    expect(await put([])).toEqual([]);
    expect(
      recipeResponseSchema.parse((await getRecipe(created.id)).json()).recipe
        .preparation,
    ).toEqual([]);
  });

  it('sets, changes and clears the appliance the recipe is for', async () => {
    const created = await createdRecipe(
      recipeInput({ appliance: 'air fryer (Cosori CAF-R121-KEU)' }),
    );
    expect(created.appliance).toBe('air fryer (Cosori CAF-R121-KEU)');

    const replace = (payload: object) =>
      app.inject({
        method: 'PUT',
        url: `/api/recipes/${created.id}`,
        headers,
        payload,
      });

    const changed = await replace(recipeInput({ appliance: 'sous vide' }));
    expect(changed.json().recipe.appliance).toBe('sous vide');

    const cleared = await replace(recipeInput());
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().recipe).not.toHaveProperty('appliance');
    expect((await getRecipe(created.id)).json().recipe).not.toHaveProperty(
      'appliance',
    );
  });

  it('answers 400 invalid_reference for an unknown ingredientId and keeps the recipe as it was', async () => {
    const potato = await seedIngredient('картоф');
    const created = await createdRecipe(
      recipeInput({
        ingredients: [{ ingredientId: potato.id, quantity: 1, unit: 'kg' }],
      }),
    );

    const response = await app.inject({
      method: 'PUT',
      url: `/api/recipes/${created.id}`,
      headers,
      payload: recipeInput({
        title: 'Друго',
        ingredients: [
          {
            ingredientId: '99999999-9999-4999-8999-999999999999',
            quantity: 1,
            unit: 'pcs',
          },
        ],
      }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'invalid_reference' });
    expect((await getRecipe(created.id)).json()).toEqual({ recipe: created });
  });

  it('answers 400 invalid_reference for a step with an unknown photo and keeps the recipe as it was', async () => {
    const created = await createdRecipe(recipeInput());

    const response = await app.inject({
      method: 'PUT',
      url: `/api/recipes/${created.id}`,
      headers,
      payload: recipeInput({
        steps: [
          { text: 'Друго.', photoId: '99999999-9999-4999-8999-999999999999' },
        ],
      }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'invalid_reference' });
    expect((await getRecipe(created.id)).json()).toEqual({ recipe: created });
  });

  it('answers 404 not_found for an unknown id', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/recipes/99999999-9999-4999-8999-999999999999',
      headers,
      payload: recipeInput(),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: 'not_found' });
  });
});

function rate(id: string, rating: unknown) {
  return app.inject({
    method: 'PUT',
    url: `/api/recipes/${id}/rating`,
    headers,
    payload: { rating },
  });
}

function unrate(id: string) {
  return app.inject({
    method: 'DELETE',
    url: `/api/recipes/${id}/rating`,
    headers,
  });
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

describe('PUT and DELETE /api/recipes/:id/rating', () => {
  it('rates a recipe, changes the rating and takes it back, answering the updated recipe', async () => {
    const created = await createdRecipe(recipeInput());

    const first = await rate(created.id, 4);
    expect(first.statusCode).toBe(200);
    expect(recipeResponseSchema.parse(first.json()).recipe).toEqual({
      ...created,
      rating: 4,
    });

    const changed = await rate(created.id, 2);
    expect(changed.json().recipe.rating).toBe(2);
    expect((await getRecipe(created.id)).json().recipe.rating).toBe(2);

    const removed = await unrate(created.id);
    expect(removed.statusCode).toBe(200);
    expect(removed.json().recipe.rating).toBeNull();
    expect((await getRecipe(created.id)).json().recipe.rating).toBeNull();
  });

  it('keeps the rating when the recipe is replaced', async () => {
    const created = await createdRecipe(recipeInput());
    await rate(created.id, 5);

    const replaced = await app.inject({
      method: 'PUT',
      url: `/api/recipes/${created.id}`,
      headers,
      payload: recipeInput({ title: 'Картофи на фурна' }),
    });

    expect(replaced.json().recipe.rating).toBe(5);
  });

  it('rates an archived recipe', async () => {
    const created = await createdRecipe(recipeInput());
    await archive(created.id);

    const response = await rate(created.id, 3);

    expect(response.statusCode).toBe(200);
    expect(response.json().recipe).toMatchObject({
      rating: 3,
      archivedAt: expect.any(String),
    });
  });

  it.each([0, 6, 3.5, '4', null])(
    'answers 400 validation_error for rating %j and keeps the rating',
    async (rating) => {
      const created = await createdRecipe(recipeInput());
      await rate(created.id, 4);

      const response = await rate(created.id, rating);

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: 'validation_error' });
      expect((await getRecipe(created.id)).json().recipe.rating).toBe(4);
    },
  );

  it('answers 404 not_found for an unknown id', async () => {
    const id = '99999999-9999-4999-8999-999999999999';

    expect((await rate(id, 3)).statusCode).toBe(404);
    expect((await unrate(id)).statusCode).toBe(404);
  });

  it('signals no menu.changed: a rating is not a change to the menu', async () => {
    const created = await createdRecipe(recipeInput());

    const signals = await signalsOf(async () => {
      await rate(created.id, 5);
      await unrate(created.id);
    });

    expect(signals).toEqual([]);
  });
});

describe('POST /api/recipes/:id/archive and /unarchive', () => {
  it('archives a recipe and brings it back', async () => {
    const created = await createdRecipe(recipeInput());

    const archived = await archive(created.id);
    expect(archived.statusCode).toBe(200);
    const { recipe } = recipeResponseSchema.parse(archived.json());
    expect(recipe.archivedAt).toEqual(expect.any(String));
    expect((await getRecipe(created.id)).json()).toEqual({ recipe });

    const restored = await archive(created.id, 'unarchive');
    expect(restored.statusCode).toBe(200);
    expect(restored.json().recipe.archivedAt).toBeNull();
    expect(await listTitles('')).toEqual(['Печени картофи']);
  });

  it('keeps the first archive date when archived twice', async () => {
    const created = await createdRecipe(recipeInput());
    const first = (await archive(created.id)).json().recipe;

    const second = await archive(created.id);

    expect(second.json().recipe.archivedAt).toBe(first.archivedAt);
  });

  it('answers 404 not_found for an unknown id', async () => {
    const response = await archive('99999999-9999-4999-8999-999999999999');

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: 'not_found' });
  });
});
