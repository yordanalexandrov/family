import { z } from 'zod';
import {
  MINUTES_BEFORE_MAX,
  OVEN_DEGREES_MAX,
  OVEN_DEGREES_MIN,
  ovenFanSchema,
  ovenRackSchema,
  PREPARATION_MAX,
  PREPARATION_TEXT_MAX,
  preparationKindSchema,
} from '../food/preparation.js';

/**
 * The preparation (GLOSSARY: Подготовка) of an AI contract's recipe as the agent writes it under strict structured
 * outputs: an oven or another kind, every property required, an optional one (`rack`, `minutesBefore`) sent as `null`.
 * Only for the JSON Schema of a contract's `responseFormat`; the output itself is parsed with `preparationSchema`, after
 * {@link preparationFromStrict}. At most one oven is not in it.
 */
export const preparationStrictSchema = z
  .array(
    z.union([
      z.object({
        kind: z.literal('oven'),
        degrees: z.int().min(OVEN_DEGREES_MIN).max(OVEN_DEGREES_MAX),
        fan: ovenFanSchema,
        rack: ovenRackSchema.nullable(),
      }),
      z.object({
        kind: preparationKindSchema.exclude(['oven']),
        text: z.string().max(PREPARATION_TEXT_MAX),
        minutesBefore: z.int().min(1).max(MINUTES_BEFORE_MAX).nullable(),
      }),
    ]),
  )
  .max(PREPARATION_MAX);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * `rack: null` and `minutesBefore: null` of the items (how strict mode says "none") become absent; anything else is
 * left for `preparationSchema`.
 */
export function preparationFromStrict(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }
  return value.map((item) => {
    if (!isRecord(item)) {
      return item;
    }
    const { rack, minutesBefore, ...rest } = item;
    return {
      ...rest,
      ...(rack === null || rack === undefined ? {} : { rack }),
      ...(minutesBefore === null || minutesBefore === undefined
        ? {}
        : { minutesBefore }),
    };
  });
}
