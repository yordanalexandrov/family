import { describe, expect, it } from 'vitest';
import {
  inPrepTimeRanges,
  PREP_TIME_RANGES,
  prepTimeRangeSchema,
} from './prep-time.js';

describe('prepTimeRangeSchema', () => {
  it('every time falls in exactly one interval', () => {
    for (const minutes of [1, 15, 16, 30, 31, 45, 46, 60, 61, 240]) {
      const matching = prepTimeRangeSchema.options.filter((range) =>
        inPrepTimeRanges(minutes, [range]),
      );
      expect(matching, `${minutes} мин`).toHaveLength(1);
    }
  });

  it('the bounds follow the names', () => {
    expect(PREP_TIME_RANGES['15-30']).toEqual({ above: 15, upTo: 30 });
    expect(PREP_TIME_RANGES['60+']).toEqual({ above: 60, upTo: null });
  });

  it('rejects an interval that is not in the list', () => {
    expect(prepTimeRangeSchema.safeParse('10-20').success).toBe(false);
  });
});

describe('inPrepTimeRanges', () => {
  it('several intervals match their union', () => {
    expect(inPrepTimeRanges(10, ['0-15', '30-45'])).toBe(true);
    expect(inPrepTimeRanges(40, ['0-15', '30-45'])).toBe(true);
    expect(inPrepTimeRanges(20, ['0-15', '30-45'])).toBe(false);
  });

  it('no intervals match any time', () => {
    expect(inPrepTimeRanges(90, [])).toBe(true);
  });
});
