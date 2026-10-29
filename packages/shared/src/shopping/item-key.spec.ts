import { describe, expect, it } from 'vitest';
import {
  computedItemKey,
  manualItemKey,
  normalizeItemKey,
  parseItemKey,
} from './item-key.js';

const ONION = '10000000-0000-4000-8000-000000000001';
const MANUAL = '50000000-0000-4000-8000-000000000001';

describe('item keys', () => {
  it('writes a computed key as <ingredientId>, one row of the ingredient in every unit, and reads it back', () => {
    const key = computedItemKey(ONION);

    expect(key).toBe(ONION);
    expect(parseItemKey(key)).toEqual({
      kind: 'computed',
      ingredientId: ONION,
    });
  });

  it.each([
    ['a unit', `${ONION}:g`],
    ['pieces', `${ONION}:pcs`],
    ['no unit', `${ONION}:none`],
  ])(
    'reads an old key with %s (<ingredientId>:<unit>) as its ingredient’s row',
    (_, key) => {
      expect(parseItemKey(key)).toEqual({
        kind: 'computed',
        ingredientId: ONION,
      });
      expect(normalizeItemKey(key)).toBe(ONION);
    },
  );

  it('keeps a manual key and a key it cannot read as they are', () => {
    expect(normalizeItemKey(`manual:${MANUAL}`)).toBe(`manual:${MANUAL}`);
    expect(normalizeItemKey('coffee')).toBe('coffee');
  });

  it('writes a manual key as manual:<id> and reads it back', () => {
    const key = manualItemKey(MANUAL);

    expect(key).toBe(`manual:${MANUAL}`);
    expect(parseItemKey(key)).toEqual({ kind: 'manual', id: MANUAL });
  });

  it.each([
    ['an empty key', ''],
    ['an unknown unit', `${ONION}:cup`],
    // Computed keys are normalized: kg and l are summed as g and ml.
    ['a unit that is not normalized', `${ONION}:kg`],
    ['an id that is not a uuid', 'onion:g'],
    ['a manual key without a uuid', 'manual:coffee'],
    ['extra parts', `${ONION}:g:x`],
  ])('refuses %s', (_, key) => {
    expect(parseItemKey(key)).toBeNull();
  });
});
