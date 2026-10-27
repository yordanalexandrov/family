import { z } from 'zod';
import { aisleSchema } from '../food/aisles.js';

/** GLOSSARY: Постоянен продукт (`staple`) and Временен продукт (`use_up`). */
export const pantryKindSchema = z.enum(['staple', 'use_up']);

export type PantryKind = z.infer<typeof pantryKindSchema>;

/** Longest note of a pantry item ("фризер, ~500 г"). */
export const PANTRY_NOTE_MAX = 80;

/** A trimmed note; blank means none (`null`). */
const pantryNoteSchema = z
  .string()
  .trim()
  .max(PANTRY_NOTE_MAX)
  .nullable()
  .transform((note) => note || null);

/**
 * An ingredient in the pantry (GLOSSARY: Килер), at most once per ingredient and without a quantity. `ranOutAt` is set
 * only on a staple someone said ran out; until it is bought, every shopping list shows it.
 */
export const pantryItemSchema = z.object({
  id: z.uuid(),
  ingredient: z.object({
    id: z.uuid(),
    name: z.string(),
    aisle: aisleSchema,
  }),
  kind: pantryKindSchema,
  note: z.string().nullable(),
  ranOutAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export type PantryItem = z.infer<typeof pantryItemSchema>;

/**
 * A use-up product as the AI contracts `menu.propose` and `meal.replace` see it (GLOSSARY: Временен продукт): the
 * ingredient's name and the note, for the agent to prefer recipes that use it.
 */
export const useUpSchema = z.object({
  name: z.string(),
  note: z.string().optional(),
});

export type UseUp = z.infer<typeof useUpSchema>;

/** `POST /api/pantry`: an ingredient not in the pantry yet. */
export const createPantryItemSchema = z.object({
  ingredientId: z.uuid(),
  kind: pantryKindSchema,
  note: pantryNoteSchema.optional(),
});

export type CreatePantryItem = z.infer<typeof createPantryItemSchema>;

/** `PATCH /api/pantry/:id`: the kind, the note, or both. A staple that becomes a use-up item no longer ran out. */
export const updatePantryItemSchema = z
  .object({
    kind: pantryKindSchema,
    note: pantryNoteSchema,
  })
  .partial();

export type UpdatePantryItem = z.infer<typeof updatePantryItemSchema>;

/** `GET /api/pantry`: staples first, then use-up items oldest first; each group by name. */
export const pantryResponseSchema = z.object({
  items: z.array(pantryItemSchema),
});

export type PantryResponse = z.infer<typeof pantryResponseSchema>;

export const pantryItemResponseSchema = z.object({
  item: pantryItemSchema,
});

export type PantryItemResponse = z.infer<typeof pantryItemResponseSchema>;

/** 409 of `POST /api/pantry`: the ingredient is in the pantry already, once per ingredient. */
export const alreadyInPantrySchema = z.object({
  error: z.literal('conflict'),
  code: z.literal('already_in_pantry'),
  message: z.string(),
});

export type AlreadyInPantry = z.infer<typeof alreadyInPantrySchema>;

/** 409 of `POST /api/pantry/:id/ran-out`: only a staple runs out („Свърши“). */
export const notStapleSchema = z.object({
  error: z.literal('conflict'),
  code: z.literal('not_staple'),
  message: z.string(),
});

export type NotStaple = z.infer<typeof notStapleSchema>;
