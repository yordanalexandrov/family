import { describe, expect, it } from 'vitest';
import {
  createIngredientSchema,
  ingredientSchema,
  normalizeIngredientName,
  updateIngredientSchema,
} from './ingredient.js';

const chicken = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'пилешко филе',
  unit: 'g',
  aisle: 'meat',
};

describe('normalizeIngredientName', () => {
  it('trims, lower-cases and collapses inner whitespace', () => {
    expect(normalizeIngredientName('  Пилешко \t  ФИЛЕ ')).toBe('пилешко филе');
  });
});

describe('ingredientSchema', () => {
  it('accepts an ingredient with a base unit and an aisle', () => {
    expect(ingredientSchema.parse(chicken)).toEqual(chicken);
  });

  it('rejects a unit that is not a base unit (kg is summed as g)', () => {
    const result = ingredientSchema.safeParse({ ...chicken, unit: 'kg' });

    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual([
      'unit',
    ]);
  });
});

describe('createIngredientSchema', () => {
  it('turns the name into its canonical form: trimmed, lower case', () => {
    expect(
      createIngredientSchema.parse({
        name: '  Пилешко  Филе ',
        unit: 'g',
        aisle: 'meat',
      }),
    ).toEqual({ name: 'пилешко филе', unit: 'g', aisle: 'meat' });
  });

  it('rejects a blank name', () => {
    expect(
      createIngredientSchema.safeParse({
        name: '   ',
        unit: 'g',
        aisle: 'meat',
      }).success,
    ).toBe(false);
  });
});

describe('updateIngredientSchema', () => {
  it('accepts a change of the aisle alone', () => {
    expect(updateIngredientSchema.parse({ aisle: 'frozen' })).toEqual({
      aisle: 'frozen',
    });
  });
});
