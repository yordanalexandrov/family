import { describe, expect, it } from 'vitest';
import { scaleQuantity } from './scale.js';

describe('scaleQuantity', () => {
  it('scales an amount by the ratio of servings: 500 g for 4 is 250 g for 2', () => {
    expect(scaleQuantity({ quantity: 500, unit: 'g' }, 4, 2)).toEqual({
      quantity: 250,
      unit: 'g',
    });
  });

  it('reads 1000 g and more as kilograms: 600 g for 2 is 1,8 kg for 6', () => {
    expect(scaleQuantity({ quantity: 600, unit: 'g' }, 2, 6)).toEqual({
      quantity: 1.8,
      unit: 'kg',
    });
  });

  it('reads 1000 ml and more as litres', () => {
    expect(scaleQuantity({ quantity: 250, unit: 'ml' }, 1, 4)).toEqual({
      quantity: 1,
      unit: 'l',
    });
  });

  it('turns kilograms below 1 back into grams: 1 kg for 4 is 250 g for 1', () => {
    expect(scaleQuantity({ quantity: 1, unit: 'kg' }, 4, 1)).toEqual({
      quantity: 250,
      unit: 'g',
    });
  });

  it('keeps pieces and spoons in their unit, without float noise', () => {
    expect(scaleQuantity({ quantity: 0.1, unit: 'tsp' }, 1, 3)).toEqual({
      quantity: 0.3,
      unit: 'tsp',
    });
    expect(scaleQuantity({ quantity: 2, unit: 'pcs' }, 4, 6)).toEqual({
      quantity: 3,
      unit: 'pcs',
    });
  });

  it('keeps a pinch without a quantity', () => {
    expect(scaleQuantity({ quantity: null, unit: 'pinch' }, 4, 8)).toEqual({
      quantity: null,
      unit: 'pinch',
    });
  });
});
