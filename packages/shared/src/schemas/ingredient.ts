import { z } from 'zod';
import { aisleSchema } from '../food/aisles.js';
import { baseUnitSchema } from '../food/units.js';

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
