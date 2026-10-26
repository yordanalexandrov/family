import { z } from 'zod';
import { prepTimeRangeSchema } from '../food/prep-time.js';
import { tagSchema } from '../food/tags.js';
import {
  checkPinchQuantity,
  quantitySchema,
  unitSchema,
} from '../food/units.js';
import { ingredientSchema } from './ingredient.js';

/** Approximate nutrition per 100 g, shown with "≈". */
export const nutritionSchema = z.object({
  kcal: z.number().nonnegative(),
  proteinG: z.number().nonnegative(),
  fatG: z.number().nonnegative(),
  carbsG: z.number().nonnegative(),
});

export type Nutrition = z.infer<typeof nutritionSchema>;

const recipeIngredientFields = {
  ingredientId: z.uuid(),
  quantity: quantitySchema,
  unit: unitSchema,
  note: z.string().optional(),
};

/** One ingredient line of a recipe; a pinch has `quantity: null`. */
export const recipeIngredientSchema = z
  .object(recipeIngredientFields)
  .superRefine(checkPinchQuantity);

export type RecipeIngredient = z.infer<typeof recipeIngredientSchema>;

/** What the client sends to create or replace a recipe (GLOSSARY: Рецепта). Titles are not unique. */
export const recipeInputSchema = z.object({
  title: z.string().trim().min(1),
  servings: z.int().min(1),
  steps: z.array(z.string().trim().min(1)).min(1),
  sourceUrl: z.url().optional(),
  prepMinutes: z.int().positive().optional(),
  tags: z.array(tagSchema),
  nutritionPer100g: nutritionSchema.optional(),
  ingredients: z.array(recipeIngredientSchema),
});

export type RecipeInput = z.infer<typeof recipeInputSchema>;

/**
 * A stored ingredient line with its ingredient (name, base unit, aisle) joined in. It is a superset of
 * `RecipeIngredient`, so the lines of a fetched recipe can be sent back as input unchanged.
 */
export const recipeLineSchema = z.object({
  ...recipeIngredientFields,
  ingredient: ingredientSchema,
});

export type RecipeLine = z.infer<typeof recipeLineSchema>;

/** A recipe in the registry; archived ones keep `archivedAt` and are hidden by default. */
export const recipeSchema = recipeInputSchema.extend({
  ingredients: z.array(recipeLineSchema),
  id: z.uuid(),
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Recipe = z.infer<typeof recipeSchema>;

export const recipeResponseSchema = z.object({ recipe: recipeSchema });

export type RecipeResponse = z.infer<typeof recipeResponseSchema>;

/** One row of the registry list, without ingredients and steps. */
export const recipeSummarySchema = recipeSchema.pick({
  id: true,
  title: true,
  servings: true,
  prepMinutes: true,
  tags: true,
  archivedAt: true,
});

export type RecipeSummary = z.infer<typeof recipeSummarySchema>;

/** A query parameter that may repeat (`?tag=lunch&tag=dinner`): one value arrives as a string, several as an array. */
function repeated<T extends z.ZodType>(item: T) {
  return z.preprocess(
    (value) => (value === undefined || Array.isArray(value) ? value : [value]),
    z.array(item).default([]),
  );
}

/**
 * `GET /api/recipes`: `q` matches anywhere in the title ignoring case. `tag` repeats: slot tags match any of them
 * (обяд или вечеря), the other tags all of them. `time` repeats: recipes whose prep time is in any of the intervals
 * (a recipe without a time does not match).
 */
export const recipesQuerySchema = z.object({
  q: z.string().trim().optional(),
  tag: repeated(tagSchema),
  time: repeated(prepTimeRangeSchema),
  includeArchived: z.stringbool().default(false),
});

export type RecipesQuery = z.infer<typeof recipesQuerySchema>;

export const recipesResponseSchema = z.object({
  recipes: z.array(recipeSummarySchema),
});

export type RecipesResponse = z.infer<typeof recipesResponseSchema>;
