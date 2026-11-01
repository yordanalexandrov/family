import { z } from 'zod';
import {
  MINUTES_BEFORE_MAX,
  ovenFanSchema,
  ovenRackSchema,
  type Preparation,
  type PreparationItem,
  preparationKindSchema,
  preparationSchema,
} from '../food/preparation.js';

/**
 * The preparation (GLOSSARY: Подготовка) as an AI contract returns it. Strict structured outputs want every field, so
 * an optional field of the recipe's preparation is `null` here when there is none: the oven's `rack`, the other kinds'
 * `minutesBefore`. The output schema reads it into the recipe's {@link Preparation} (`null` → absent) and checks it with
 * {@link preparationSchema} (0–8 items, at most one oven).
 */
const aiOvenSchema = z.object({
  kind: z.literal('oven'),
  degrees: z.int(),
  fan: ovenFanSchema,
  rack: ovenRackSchema.nullable(),
});

const aiTextSchema = z.object({
  kind: preparationKindSchema.exclude(['oven']),
  text: z.string(),
  minutesBefore: z.int().max(MINUTES_BEFORE_MAX).nullable(),
});

function fromAi(
  item: z.infer<typeof aiOvenSchema> | z.infer<typeof aiTextSchema>,
): PreparationItem {
  if (item.kind === 'oven') {
    const { rack, ...oven } = item;
    return rack === null ? oven : { ...oven, rack };
  }
  const { minutesBefore, ...rest } = item;
  return minutesBefore === null ? rest : { ...rest, minutesBefore };
}

/** The output schema of the preparation: the AI form, read into the recipe's preparation and checked as it. */
export const aiPreparationSchema: z.ZodType<Preparation, unknown> = z
  .array(
    z.discriminatedUnion('kind', [
      aiOvenSchema.strict(),
      aiTextSchema.strict(),
    ]),
  )
  .transform((items) => items.map(fromAi))
  .pipe(preparationSchema);

/**
 * The preparation in the response JSON Schema: `anyOf` (not the `oneOf` of a discriminated union), which strict
 * structured outputs accept.
 */
export const aiPreparationResponseSchema = z.array(
  z.union([aiOvenSchema, aiTextSchema]),
);
