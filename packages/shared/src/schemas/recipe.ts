import { z } from 'zod';
import { tagSchema } from '../food/tags.js';
import {
  checkPinchQuantity,
  quantitySchema,
  unitSchema,
} from '../food/units.js';

/** Approximate nutrition per 100 g, shown with "≈". */
export const nutritionSchema = z.object({
  kcal: z.number().nonnegative(),
  proteinG: z.number().nonnegative(),
  fatG: z.number().nonnegative(),
  carbsG: z.number().nonnegative(),
});

export type Nutrition = z.infer<typeof nutritionSchema>;

/** One ingredient line of a recipe; a pinch has `quantity: null`. */
export const recipeIngredientSchema = z
  .object({
    ingredientId: z.uuid(),
    quantity: quantitySchema,
    unit: unitSchema,
    note: z.string().optional(),
  })
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

/** A recipe in the registry; archived ones keep `archivedAt` and are hidden by default. */
export const recipeSchema = recipeInputSchema.extend({
  id: z.uuid(),
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Recipe = z.infer<typeof recipeSchema>;
