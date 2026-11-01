import { z } from 'zod';
import { cookingChangeSchema } from '../food/cooking-change.js';

/**
 * What Готвене remembers on a device next to its progress (web: `family.cooking.progress`, per recipe, for the day).
 * Only web reads it; as with the timers, a list an older version wrote or someone edited is refused as a whole (an
 * empty list), not half-read.
 */

/**
 * The questions in Готвене asked from the device, in the order asked (GLOSSARY: Въпрос в Готвене): the id in api and
 * the text, so that the question shows and can be asked again when api no longer knows it (404).
 */
export const rememberedQuestionsSchema = z.array(
  z.object({ id: z.string().min(1), question: z.string().min(1) }),
);

export type RememberedQuestion = z.infer<
  typeof rememberedQuestionsSchema
>[number];

/**
 * The cooking changes applied on the device, in the order applied (GLOSSARY: Промяна за готвенето): the id of the
 * question whose answer brings it, the servings when it was asked and the change itself, read by its schema (one
 * remembered before the steps has none).
 */
export const appliedChangesSchema = z.array(
  z.object({
    id: z.string().min(1),
    servings: z.int().min(1),
    change: cookingChangeSchema,
  }),
);

export type AppliedChange = z.infer<typeof appliedChangesSchema>[number];
