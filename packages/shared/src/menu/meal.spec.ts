import { describe, expect, it } from 'vitest';
import {
  isOneServingEach,
  mealTitle,
  oneServingEach,
  totalServings,
} from './meal.js';

const DANI = '00000000-0000-4000-8000-000000000001';
const POLI = '00000000-0000-4000-8000-000000000002';

describe('mealTitle', () => {
  it('is the recipe title, even with a note', () => {
    expect(mealTitle({ recipe: { title: 'Мусака' }, note: 'двойно' })).toBe(
      'Мусака',
    );
  });

  it('is the note without a recipe', () => {
    expect(mealTitle({ recipe: null, note: 'ядем навън' })).toBe('ядем навън');
  });

  it('is null for an empty meal', () => {
    expect(mealTitle({ recipe: null, note: null })).toBeNull();
  });
});

describe('oneServingEach', () => {
  it('gives every user one serving', () => {
    expect(oneServingEach([DANI, POLI])).toEqual({ [DANI]: 1, [POLI]: 1 });
  });
});

describe('isOneServingEach', () => {
  it('accepts the default', () => {
    expect(isOneServingEach({ [DANI]: 1, [POLI]: 1 }, [DANI, POLI])).toBe(true);
  });

  it('refuses a changed count', () => {
    expect(isOneServingEach({ [DANI]: 2, [POLI]: 1 }, [DANI, POLI])).toBe(
      false,
    );
  });

  it('refuses a missing or an extra user', () => {
    expect(isOneServingEach({ [DANI]: 1 }, [DANI, POLI])).toBe(false);
    expect(isOneServingEach({ [DANI]: 1, [POLI]: 1 }, [DANI])).toBe(false);
  });
});

describe('totalServings', () => {
  it('adds up the servings of all users', () => {
    expect(totalServings({ [DANI]: 2, [POLI]: 0 })).toBe(2);
    expect(totalServings({})).toBe(0);
  });
});
