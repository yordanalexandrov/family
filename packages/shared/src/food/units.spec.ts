import { describe, expect, it } from 'vitest';
import { normalizeQuantity, UNIT_LABELS_BG, unitSchema } from './units.js';

describe('normalizeQuantity', () => {
  it('turns kilograms into grams', () => {
    expect(normalizeQuantity(1.5, 'kg')).toEqual({ quantity: 1500, unit: 'g' });
  });

  it('turns litres into millilitres', () => {
    expect(normalizeQuantity(0.25, 'l')).toEqual({ quantity: 250, unit: 'ml' });
  });

  it('gives a round number for decimal kilograms (no 2009.9999999999998)', () => {
    expect(normalizeQuantity(2.01, 'kg')).toEqual({
      quantity: 2010,
      unit: 'g',
    });
  });

  it('leaves every other unit as it is, spoons included', () => {
    expect(normalizeQuantity(2, 'tbsp')).toEqual({ quantity: 2, unit: 'tbsp' });
    expect(normalizeQuantity(3, 'pcs')).toEqual({ quantity: 3, unit: 'pcs' });
    expect(normalizeQuantity(200, 'g')).toEqual({ quantity: 200, unit: 'g' });
  });

  it('keeps a pinch without a quantity', () => {
    expect(normalizeQuantity(null, 'pinch')).toEqual({
      quantity: null,
      unit: 'pinch',
    });
  });
});

describe('unitSchema', () => {
  it('has a Bulgarian label for every unit', () => {
    expect(UNIT_LABELS_BG).toEqual({
      g: 'г',
      kg: 'кг',
      ml: 'мл',
      l: 'л',
      pcs: 'бр.',
      tbsp: 'с.л.',
      tsp: 'ч.л.',
      pinch: 'по вкус',
    });
  });

  it('rejects a unit outside the fixed list', () => {
    expect(unitSchema.safeParse('cup').success).toBe(false);
  });
});
