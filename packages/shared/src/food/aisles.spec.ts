import { describe, expect, it } from 'vitest';
import { AISLES, aisleSchema } from './aisles.js';

describe('AISLES', () => {
  it('lists the aisles in the walking order of a typical store, from produce to other', () => {
    expect(AISLES.map((aisle) => aisle.key)).toEqual([
      'produce',
      'bakery',
      'meat',
      'fish',
      'dairy',
      'grains',
      'canned',
      'spices',
      'frozen',
      'drinks',
      'other',
    ]);
    expect(AISLES.map((aisle) => aisle.order)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
  });

  it('accepts every listed aisle and nothing else (legumes are in grains)', () => {
    for (const { key } of AISLES) {
      expect(aisleSchema.parse(key)).toBe(key);
    }
    expect(aisleSchema.safeParse('legumes').success).toBe(false);
  });
});
