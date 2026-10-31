import { z } from 'zod';

/**
 * GLOSSARY: Таймер. The timers a device keeps in localStorage (web: `family.timers`), in the order they were started.
 * Only web reads them; the schema is here, next to the other stored records, so a record an older version wrote or
 * someone edited is refused as a whole (an empty list), not half-read.
 */
export const storedTimersSchema = z.array(
  z.object({
    id: z.string(),
    recipeId: z.string(),
    recipeTitle: z.string(),
    step: z.int().min(0),
    label: z.string(),
    durationMs: z.number(),
    maxDurationMs: z.number().optional(),
    manual: z.literal(true).optional(),
    endsAt: z.number(),
    pausedAt: z.number().optional(),
  }),
);

export type StoredTimer = z.infer<typeof storedTimersSchema>[number];
