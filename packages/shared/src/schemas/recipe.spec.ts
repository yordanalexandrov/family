import { describe, expect, it } from 'vitest';
import {
  canonicalTitle,
  putRatingSchema,
  recipeFiltersSchema,
  recipeInputSchema,
  recipeSchema,
  recipesQuerySchema,
} from './recipe.js';

const SALT = '44444444-4444-4444-8444-444444444444';
const POTATO = '55555555-5555-4555-8555-555555555555';

const potatoes = {
  title: 'Печени картофи с розмарин',
  servings: 4,
  steps: [
    { text: 'Нарежи картофите.' },
    {
      text: 'Печи 40 минути на 200 °C.',
      photoId: '66666666-6666-4666-8666-666666666666',
    },
  ],
  sourceUrl: 'https://example.com/pecheni-kartofi',
  prepMinutes: 50,
  tags: ['dinner', 'kid_friendly'],
  nutritionPer100g: { kcal: 120, proteinG: 2, fatG: 5, carbsG: 17 },
  preparation: [
    { kind: 'oven', degrees: 200, fan: 'fan' },
    { kind: 'soak', text: 'накисни картофите', minutesBefore: 30 },
  ],
  ingredients: [
    { ingredientId: POTATO, quantity: 1, unit: 'kg' },
    { ingredientId: SALT, quantity: null, unit: 'pinch', note: 'морска' },
  ],
};

describe('recipeSchema', () => {
  it('accepts a stored recipe with its id, dates, archive mark, components and joined ingredients', () => {
    const stored = {
      ...potatoes,
      components: [{ name: 'Песто', servings: 5 }],
      ingredients: [
        {
          ingredientId: POTATO,
          quantity: 1,
          unit: 'kg',
          component: 0,
          ingredient: {
            id: POTATO,
            name: 'картоф',
            unit: 'g',
            aisle: 'produce',
          },
        },
      ],
      id: '66666666-6666-4666-8666-666666666666',
      archivedAt: null,
      rating: 4,
      createdAt: '2026-10-25T10:00:00.000Z',
      updatedAt: '2026-10-25T10:00:00.000Z',
      openRevision: {
        id: '77777777-7777-4777-8777-777777777777',
        status: 'done',
      },
    };

    expect(recipeSchema.parse(stored)).toEqual(stored);
  });
});

describe('putRatingSchema', () => {
  it.each([1, 5])('accepts %j stars', (rating) => {
    expect(putRatingSchema.parse({ rating })).toEqual({ rating });
  });

  it.each([0, 6, 2.5, '3', null])('refuses rating %j', (rating) => {
    expect(putRatingSchema.safeParse({ rating }).success).toBe(false);
  });
});

describe('recipesQuerySchema', () => {
  it('sorts by title unless sort=rating', () => {
    expect(recipesQuerySchema.parse({}).sort).toBe('title');
    expect(recipesQuerySchema.parse({ sort: 'rating' }).sort).toBe('rating');
    expect(recipesQuerySchema.safeParse({ sort: 'stars' }).success).toBe(false);
  });
});

describe('recipeFiltersSchema', () => {
  it('keeps the known filters of a stored value', () => {
    const filters = {
      tags: ['dinner', 'quick'],
      times: ['15-30'],
      includeArchived: true,
      sort: 'rating',
    };
    expect(recipeFiltersSchema.parse(filters)).toEqual(filters);
  });

  it('drops what an older or edited value no longer knows, field by field', () => {
    expect(
      recipeFiltersSchema.parse({
        tags: ['dinner', 'spicy', 3],
        times: 'all',
        includeArchived: 'yes',
        sort: 'stars',
      }),
    ).toEqual({
      tags: ['dinner'],
      times: [],
      includeArchived: false,
      sort: 'title',
    });
    expect(recipeFiltersSchema.parse({})).toEqual({
      tags: [],
      times: [],
      includeArchived: false,
      sort: 'title',
    });
  });
});

describe('recipeInputSchema', () => {
  it('accepts a manually entered recipe with only the required fields', () => {
    const minimal = {
      title: 'Омлет',
      servings: 1,
      steps: [{ text: 'Разбий яйцата и ги изпържи.' }],
      tags: [],
      ingredients: [],
    };

    expect(recipeInputSchema.parse(minimal)).toEqual({
      ...minimal,
      preparation: [],
      components: [],
    });
  });

  it('accepts a full recipe; lines without a component are main lines', () => {
    expect(recipeInputSchema.parse(potatoes)).toEqual({
      ...potatoes,
      components: [],
      ingredients: potatoes.ingredients.map((line) => ({
        ...line,
        component: null,
      })),
    });
  });

  it('accepts a recipe with components and lines in them', () => {
    const risotto = {
      ...potatoes,
      servings: 1,
      components: [{ name: 'Песто', servings: 5 }],
      ingredients: [
        { ingredientId: POTATO, quantity: 100, unit: 'g', component: null },
        { ingredientId: SALT, quantity: null, unit: 'pinch', component: 0 },
      ],
    };

    expect(recipeInputSchema.parse(risotto)).toEqual(risotto);
  });

  it.each([
    ['components.0.name', [{ name: '  ', servings: 5 }]],
    ['components.0.name', [{ name: 'п'.repeat(41), servings: 5 }]],
    ['components.0.servings', [{ name: 'Песто', servings: 0 }]],
    ['components.0.servings', [{ name: 'Песто', servings: 2.5 }]],
  ])('rejects an invalid %s', (path, components) => {
    const result = recipeInputSchema.safeParse({
      ...potatoes,
      components,
      ingredients: [
        { ingredientId: SALT, quantity: null, unit: 'pinch', component: 0 },
      ],
    });

    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual([
      path,
    ]);
  });

  it('rejects more than 3 components', () => {
    const result = recipeInputSchema.safeParse({
      ...potatoes,
      components: ['Песто', 'Сос', 'Тесто', 'Крем'].map((name) => ({
        name,
        servings: 4,
      })),
      ingredients: [0, 1, 2, 3].map((component) => ({
        ingredientId: POTATO,
        quantity: 1,
        unit: 'kg',
        component,
      })),
    });

    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual([
      'components',
    ]);
  });

  it('rejects a component without lines', () => {
    const result = recipeInputSchema.safeParse({
      ...potatoes,
      components: [
        { name: 'Песто', servings: 5 },
        { name: 'Сос', servings: 2 },
      ],
      ingredients: [
        { ingredientId: POTATO, quantity: 1, unit: 'kg', component: 0 },
      ],
    });

    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual([
      'components.1',
    ]);
  });

  it.each([1, -1, 0.5])(
    'rejects a line in component %j that is not there',
    (component) => {
      const result = recipeInputSchema.safeParse({
        ...potatoes,
        ingredients: [
          { ingredientId: POTATO, quantity: 1, unit: 'kg', component },
        ],
      });

      expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(
        ['ingredients.0.component'],
      );
    },
  );

  it.each([
    ['servings', { servings: 0 }],
    ['servings', { servings: 1.5 }],
    ['steps', { steps: [] }],
    ['steps.0', { steps: ['Нарежи картофите.'] }],
    ['steps.0.text', { steps: [{ text: '  ' }] }],
    ['steps.0.photoId', { steps: [{ text: 'Нарежи.', photoId: 's1' }] }],
    ['sourceUrl', { sourceUrl: 'не е линк' }],
    ['tags.0', { tags: ['vegan'] }],
    [
      'preparation.1.kind',
      {
        preparation: [
          { kind: 'oven', degrees: 200, fan: 'fan' },
          { kind: 'oven', degrees: 180, fan: 'conventional' },
        ],
      },
    ],
  ])('rejects an invalid %s', (path, change) => {
    const result = recipeInputSchema.safeParse({ ...potatoes, ...change });

    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual([
      path,
    ]);
  });

  it('rejects a pinch with a quantity', () => {
    const result = recipeInputSchema.safeParse({
      ...potatoes,
      ingredients: [{ ingredientId: SALT, quantity: 2, unit: 'pinch' }],
    });

    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual([
      'ingredients.0.quantity',
    ]);
  });

  it('rejects a zero or negative quantity', () => {
    const result = recipeInputSchema.safeParse({
      ...potatoes,
      ingredients: [{ ingredientId: POTATO, quantity: 0, unit: 'g' }],
    });

    expect(result.success).toBe(false);
  });
});

describe('canonicalTitle', () => {
  it('makes titles that differ only in case and spacing equal', () => {
    expect(canonicalTitle('  Пиле   с ориз ')).toBe('пиле с ориз');
    expect(canonicalTitle('ПИЛЕ С\tОРИЗ')).toBe(canonicalTitle('Пиле с ориз'));
  });
});
