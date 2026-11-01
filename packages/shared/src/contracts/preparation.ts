import { z } from 'zod';
import {
  ovenPreparationSchema,
  PREPARATION_MAX,
  textPreparationSchema,
} from '../food/preparation.js';
import { isRecord, withoutNulls } from './strict-mode.js';

/**
 * The preparation (GLOSSARY: Подготовка) of an AI contract's recipe as the agent writes it under strict structured
 * outputs: an oven or another kind, every property required, an optional one (`rack`, `minutesBefore`) sent as `null`.
 * Only for the JSON Schema of a contract's `responseFormat`; the output itself is parsed with `preparationSchema`, after
 * {@link preparationFromStrict}. The items are the ones of `preparationSchema`, only nullable where they are optional;
 * at most one oven is not in it.
 */
export const preparationStrictSchema = z
  .array(
    z.union([
      ovenPreparationSchema.extend({
        rack: ovenPreparationSchema.shape.rack.unwrap().nullable(),
      }),
      textPreparationSchema.extend({
        minutesBefore: textPreparationSchema.shape.minutesBefore
          .unwrap()
          .nullable(),
      }),
    ]),
  )
  .max(PREPARATION_MAX);

/**
 * `rack: null` and `minutesBefore: null` of the items (how strict mode says "none") become absent; anything else is
 * left for `preparationSchema`.
 */
export function preparationFromStrict(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }
  return value.map((item) =>
    isRecord(item) ? withoutNulls(item, ['rack', 'minutesBefore']) : item,
  );
}
