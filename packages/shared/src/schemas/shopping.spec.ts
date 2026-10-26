import { describe, expect, it } from 'vitest';
import {
  createManualItemSchema,
  setCheckedSchema,
  setHiddenSchema,
  shoppingListSchema,
} from './shopping.js';

const ONION = '10000000-0000-4000-8000-000000000001';
const MEAL = '30000000-0000-4000-8000-000000000001';
const DANI = '11111111-1111-4111-8111-111111111111';

const onion = {
  key: `${ONION}:g`,
  kind: 'computed',
  title: 'лук',
  quantity: 200,
  unit: 'g',
  aisle: 'produce',
  checkedBy: DANI,
  checkedAt: '2026-10-27T17:30:00.000Z',
  hidden: false,
  sources: [{ date: '2026-10-26', mealId: MEAL, recipeTitle: 'Пилаф' }],
};

const coffee = {
  key: 'manual:50000000-0000-4000-8000-000000000001',
  kind: 'manual',
  title: 'кафе',
  quantity: null,
  unit: null,
  aisle: 'other',
  checkedBy: null,
  checkedAt: null,
  hidden: false,
  sources: [],
};

describe('shoppingListSchema', () => {
  it('accepts a list with a computed and a manual item and one hidden', () => {
    const list = {
      weekStart: '2026-10-26',
      aisles: [
        { aisle: 'produce', items: [onion] },
        { aisle: 'other', items: [coffee] },
      ],
      hidden: [{ ...onion, key: `${ONION}:pcs`, unit: 'pcs', hidden: true }],
      total: 2,
      remaining: 1,
    };

    expect(shoppingListSchema.parse(list)).toEqual(list);
  });

  it('refuses a week that does not start on Monday', () => {
    const list = {
      weekStart: '2026-10-27',
      aisles: [],
      hidden: [],
      total: 0,
      remaining: 0,
    };

    expect(shoppingListSchema.safeParse(list).success).toBe(false);
  });
});

describe('createManualItemSchema', () => {
  it('accepts a title alone, trimmed', () => {
    expect(createManualItemSchema.parse({ title: '  кафе ' })).toEqual({
      title: 'кафе',
    });
  });

  it('accepts a quantity, unit and aisle', () => {
    const item = { title: 'брашно', quantity: 1, unit: 'kg', aisle: 'grains' };

    expect(createManualItemSchema.parse(item)).toEqual(item);
  });

  it.each([
    ['a blank title', { title: '   ' }],
    ['a title over 60 characters', { title: 'к'.repeat(61) }],
    ['a quantity of 0', { title: 'кафе', quantity: 0 }],
    ['an unknown unit', { title: 'кафе', unit: 'cup' }],
    ['an unknown aisle', { title: 'кафе', aisle: 'coffee' }],
  ])('refuses %s', (_, input) => {
    expect(createManualItemSchema.safeParse(input).success).toBe(false);
  });
});

describe('setCheckedSchema and setHiddenSchema', () => {
  it('take a boolean', () => {
    expect(setCheckedSchema.parse({ checked: true })).toEqual({
      checked: true,
    });
    expect(setHiddenSchema.parse({ hidden: false })).toEqual({ hidden: false });
    expect(setCheckedSchema.safeParse({ checked: 'yes' }).success).toBe(false);
  });
});
