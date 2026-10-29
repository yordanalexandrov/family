import { describe, expect, it } from 'vitest';
import {
  canonicalTitle,
  putRatingSchema,
  recipeInputSchema,
  recipeSchema,
  recipesQuerySchema,
} from './recipe.js';

const SALT = '44444444-4444-4444-8444-444444444444';
const POTATO = '55555555-5555-4555-8555-555555555555';

const potatoes = {
  title: 'Печени картофи с розмарин',
  servings: 4,
  steps: ['Нарежи картофите.', 'Печи 40 минути на 200 °C.'],
  sourceUrl: 'https://example.com/pecheni-kartofi',
  prepMinutes: 50,
  tags: ['dinner', 'kid_friendly'],
  nutritionPer100g: { kcal: 120, proteinG: 2, fatG: 5, carbsG: 17 },
  ingredients: [
    { ingredientId: POTATO, quantity: 1, unit: 'kg' },
    { ingredientId: SALT, quantity: null, unit: 'pinch', note: 'морска' },
  ],
};

describe('recipeSchema', () => {
  it('accepts a stored recipe with its id, dates, archive mark and joined ingredients', () => {
    const stored = {
      ...potatoes,
      ingredients: [
        {
          ingredientId: POTATO,
          quantity: 1,
          unit: 'kg',
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

describe('recipeInputSchema', () => {
  it('accepts a manually entered recipe with only the required fields', () => {
    const minimal = {
      title: 'Омлет',
      servings: 1,
      steps: ['Разбий яйцата и ги изпържи.'],
      tags: [],
      ingredients: [],
    };

    expect(recipeInputSchema.parse(minimal)).toEqual(minimal);
  });

  it('accepts a full recipe', () => {
    expect(recipeInputSchema.parse(potatoes)).toEqual(potatoes);
  });

  it.each([
    ['servings', { servings: 0 }],
    ['servings', { servings: 1.5 }],
    ['steps', { steps: [] }],
    ['sourceUrl', { sourceUrl: 'не е линк' }],
    ['tags.0', { tags: ['vegan'] }],
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
