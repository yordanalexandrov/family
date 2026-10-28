import { describe, expect, it } from 'vitest';
import {
  createPantryItemSchema,
  PANTRY_NOTE_MAX,
  pantryItemSchema,
  updatePantryItemSchema,
} from './pantry.js';

const mince = {
  id: '44444444-4444-4444-8444-444444444444',
  ingredient: {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'кайма',
    aisle: 'meat',
  },
  kind: 'use_up',
  note: 'фризер, ~500 г',
  frozen: true,
  ranOutAt: null,
  createdAt: '2026-10-15T08:00:00.000Z',
};

describe('pantryItemSchema', () => {
  it('accepts a use-up item with its note', () => {
    expect(pantryItemSchema.parse(mince)).toEqual(mince);
  });

  it('accepts a staple that ran out', () => {
    const oil = {
      ...mince,
      kind: 'staple',
      note: null,
      ranOutAt: '2026-10-20T08:00:00.000Z',
    };
    expect(pantryItemSchema.parse(oil)).toEqual(oil);
  });

  it('rejects a kind other than staple and use_up', () => {
    const result = pantryItemSchema.safeParse({ ...mince, kind: 'leftover' });

    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual([
      'kind',
    ]);
  });
});

describe('createPantryItemSchema', () => {
  const ingredientId = mince.ingredient.id;

  it('trims the note, and a blank note means none', () => {
    expect(
      createPantryItemSchema.parse({
        ingredientId,
        kind: 'use_up',
        note: '  фризер ',
      }),
    ).toEqual({ ingredientId, kind: 'use_up', note: 'фризер', frozen: false });
    expect(
      createPantryItemSchema.parse({ ingredientId, kind: 'staple', note: ' ' }),
    ).toEqual({ ingredientId, kind: 'staple', note: null, frozen: false });
  });

  it('takes no note at all, and an item is not in the freezer unless said so', () => {
    expect(
      createPantryItemSchema.parse({ ingredientId, kind: 'staple' }),
    ).toEqual({ ingredientId, kind: 'staple', frozen: false });
  });

  it('takes an item that is in the freezer („Във фризера“)', () => {
    expect(
      createPantryItemSchema.parse({
        ingredientId,
        kind: 'use_up',
        frozen: true,
      }),
    ).toEqual({ ingredientId, kind: 'use_up', frozen: true });
  });

  it('rejects a note longer than the limit', () => {
    expect(
      createPantryItemSchema.safeParse({
        ingredientId,
        kind: 'use_up',
        note: 'а'.repeat(PANTRY_NOTE_MAX + 1),
      }).success,
    ).toBe(false);
  });
});

describe('updatePantryItemSchema', () => {
  it('accepts a change of the kind alone, or clearing the note', () => {
    expect(updatePantryItemSchema.parse({ kind: 'staple' })).toEqual({
      kind: 'staple',
    });
    expect(updatePantryItemSchema.parse({ note: null })).toEqual({
      note: null,
    });
  });

  it('accepts taking an item out of the freezer alone, and leaves it as it is when not said', () => {
    expect(updatePantryItemSchema.parse({ frozen: false })).toEqual({
      frozen: false,
    });
    expect(updatePantryItemSchema.parse({ kind: 'use_up' })).toEqual({
      kind: 'use_up',
    });
  });
});
