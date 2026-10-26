import { z } from 'zod';

/**
 * An interval of prep time in minutes: the lower bound is exclusive, the upper
 * inclusive, so `15-30` is 16–30 minutes and every time falls in exactly one interval. `60+` has no upper bound.
 */
export const prepTimeRangeSchema = z.enum([
  '0-15',
  '15-30',
  '30-45',
  '45-60',
  '60+',
]);

export type PrepTimeRange = z.infer<typeof prepTimeRangeSchema>;

export const PREP_TIME_RANGES: Record<
  PrepTimeRange,
  { above: number; upTo: number | null }
> = {
  '0-15': { above: 0, upTo: 15 },
  '15-30': { above: 15, upTo: 30 },
  '30-45': { above: 30, upTo: 45 },
  '45-60': { above: 45, upTo: 60 },
  '60+': { above: 60, upTo: null },
};

export const PREP_TIME_LABELS_BG: Record<PrepTimeRange, string> = {
  '0-15': 'до 15 мин',
  '15-30': '15–30 мин',
  '30-45': '30–45 мин',
  '45-60': '45–60 мин',
  '60+': 'над 60 мин',
};

/** Whether `minutes` falls in one of `ranges`; an empty list matches any time. */
export function inPrepTimeRanges(
  minutes: number,
  ranges: readonly PrepTimeRange[],
): boolean {
  return (
    ranges.length === 0 ||
    ranges.some((range) => {
      const { above, upTo } = PREP_TIME_RANGES[range];
      return minutes > above && (upTo === null || minutes <= upTo);
    })
  );
}
