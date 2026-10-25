import { z } from 'zod';
import { aisleSchema } from '../food/aisles.js';
import { baseUnitSchema } from '../food/units.js';
import { apiErrorSchema } from './error.js';

/**
 * The mechanical part of a canonical ingredient name: trimmed, lower case, single spaces.
 * Singular and without brand or weight is up to whoever writes it.
 */
export function normalizeIngredientName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export const ingredientNameSchema = z
  .string()
  .transform(normalizeIngredientName)
  .pipe(z.string().min(1));

/** A generic ingredient (GLOSSARY: Продукт) with its base unit and aisle. */
export const ingredientSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  unit: baseUnitSchema,
  aisle: aisleSchema,
});

export type Ingredient = z.infer<typeof ingredientSchema>;

export const createIngredientSchema = z.object({
  name: ingredientNameSchema,
  unit: baseUnitSchema,
  aisle: aisleSchema,
});

export type CreateIngredient = z.infer<typeof createIngredientSchema>;

export const updateIngredientSchema = createIngredientSchema.partial();

export type UpdateIngredient = z.infer<typeof updateIngredientSchema>;

/** `GET /api/ingredients?q=` for autocomplete: `q` matches anywhere in the name, ignoring case. */
export const ingredientsQuerySchema = z.object({
  q: z.string().trim().optional(),
});

export type IngredientsQuery = z.infer<typeof ingredientsQuerySchema>;

export const ingredientsResponseSchema = z.object({
  ingredients: z.array(ingredientSchema),
});

export type IngredientsResponse = z.infer<typeof ingredientsResponseSchema>;

export const ingredientResponseSchema = z.object({
  ingredient: ingredientSchema,
});

export type IngredientResponse = z.infer<typeof ingredientResponseSchema>;

/** 409 of `POST`/`PATCH /api/ingredients`: the name is taken; `ingredient` is the existing one, for the client to pick. */
export const ingredientConflictSchema = apiErrorSchema.extend({
  error: z.literal('conflict'),
  ingredient: ingredientSchema,
});

export type IngredientConflict = z.infer<typeof ingredientConflictSchema>;
