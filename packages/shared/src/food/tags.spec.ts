import { describe, expect, it } from 'vitest';
import { slotSchema, TAG_LABELS_BG, tagSchema } from './tags.js';

describe('tagSchema', () => {
  it('has a Bulgarian label for every tag', () => {
    expect(TAG_LABELS_BG).toEqual({
      breakfast: 'закуска',
      lunch: 'обяд',
      dinner: 'вечеря',
      quick: 'бързо',
      batch: 'за готвене в количество',
      kid_friendly: 'подходящо за дете',
    });
  });

  it('rejects a free-form tag', () => {
    expect(tagSchema.safeParse('vegan').success).toBe(false);
  });
});

describe('slotSchema', () => {
  it('is one of the three meals of the day, which are also tags', () => {
    expect(slotSchema.options).toEqual(['breakfast', 'lunch', 'dinner']);
    for (const slot of slotSchema.options) {
      expect(tagSchema.parse(slot)).toBe(slot);
    }
    expect(slotSchema.safeParse('quick').success).toBe(false);
  });
});
