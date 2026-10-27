import { describe, expect, it } from 'vitest';
import { computedItemKey, manualItemKey, parseItemKey } from './item-key.js';

const ONION = '10000000-0000-4000-8000-000000000001';
const MANUAL = '50000000-0000-4000-8000-000000000001';

describe('item keys', () => {
  it('writes a computed key as <ingredientId>:<unit> and reads it back', () => {
    const key = computedItemKey(ONION, 'g');

    expect(key).toBe(`${ONION}:g`);
    expect(parseItemKey(key)).toEqual({
      kind: 'computed',
      ingredientId: ONION,
      unit: 'g',
    });
  });

  it('writes the key of a row without a unit as <ingredientId>:none and reads it back', () => {
    const key = computedItemKey(ONION, null);

    expect(key).toBe(`${ONION}:none`);
    expect(parseItemKey(key)).toEqual({
      kind: 'computed',
      ingredientId: ONION,
      unit: null,
    });
  });

  it('writes a manual key as manual:<id> and reads it back', () => {
    const key = manualItemKey(MANUAL);

    expect(key).toBe(`manual:${MANUAL}`);
    expect(parseItemKey(key)).toEqual({ kind: 'manual', id: MANUAL });
  });

  it.each([
    ['an empty key', ''],
    ['no separator', ONION],
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
