import { z } from 'zod';
import { prepTimeRangeSchema } from '../food/prep-time.js';
import { tagSchema } from '../food/tags.js';
import {
  checkPinchQuantity,
  quantitySchema,
  unitSchema,
} from '../food/units.js';
import { APPLIANCE_NAME_MAX } from './appliance.js';
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

/**
 * A recipe title as it is compared: trimmed, lower case, single spaces. Recipes and suggestions with the same canonical
 * title are the same recipe (an approve or import warns about it); the title itself is kept as written.
 */
export function canonicalTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * One step of a recipe or of a stored suggestion: its text and, optionally, its photo (GLOSSARY: Снимка на стъпка) by
 * id. The AI contracts (`recipe.normalize`, `recipe.suggest`) still give steps as text; the api turns them into steps
 * with {@link stepsOfText} when it stores a suggestion.
 */
export const recipeStepSchema = z.object({
  text: z.string().trim().min(1),
  photoId: z.uuid().optional(),
});

export type RecipeStep = z.infer<typeof recipeStepSchema>;

/** Steps of text (as the AI contracts give them) as steps without photos, in the same order. */
export function stepsOfText(steps: readonly string[]): RecipeStep[] {
  return steps.map((text) => ({ text }));
}

/** What the client sends to create or replace a recipe (GLOSSARY: Рецепта). Titles are not unique. */
export const recipeInputSchema = z.object({
  title: z.string().trim().min(1),
  servings: z.int().min(1),
  steps: z.array(recipeStepSchema).min(1),
  sourceUrl: z.url().optional(),
  prepMinutes: z.int().positive().optional(),
  tags: z.array(tagSchema),
  nutritionPer100g: nutritionSchema.optional(),
  /**
   * The household appliance (GLOSSARY: Уред) the recipe is for, by its name as in „Настройки“; absent for the oven or
   * the hob. Text, not a reference: the recipe keeps it when the appliance is removed or renamed.
   */
  appliance: z.string().trim().min(1).max(APPLIANCE_NAME_MAX).optional(),
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

/** GLOSSARY: Оценка. The family's 1–5 stars for a recipe; one per recipe, anyone changes it. */
export const ratingSchema = z.int().min(1).max(5);

export type Rating = z.infer<typeof ratingSchema>;

/** `PUT /api/recipes/:id/rating`; `DELETE` on the same path makes the recipe unrated again. */
export const putRatingSchema = z.object({ rating: ratingSchema });

export type PutRating = z.infer<typeof putRatingSchema>;

/**
 * A recipe in the registry; archived ones keep `archivedAt` and are hidden by default. `rating` is `null` while the
 * recipe is unrated; it is not part of `RecipeInput`, so replacing a recipe keeps it.
 */
export const recipeSchema = recipeInputSchema.extend({
  ingredients: z.array(recipeLineSchema),
  id: z.uuid(),
  archivedAt: z.iso.datetime().nullable(),
  rating: ratingSchema.nullable(),
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
  rating: true,
});

export type RecipeSummary = z.infer<typeof recipeSummarySchema>;

/** A query parameter that may repeat (`?tag=lunch&tag=dinner`): one value arrives as a string, several as an array. */
function repeated<T extends z.ZodType>(item: T) {
  return z.preprocess(
    (value) => (value === undefined || Array.isArray(value) ? value : [value]),
    z.array(item).default([]),
  );
}

/** Order of `GET /api/recipes`: by title, or best rated first with the unrated last (by title within a rating). */
export const recipesSortSchema = z.enum(['title', 'rating']);

export type RecipesSort = z.infer<typeof recipesSortSchema>;

/** The items of `item` in an array; anything else (not an array, a value no longer known) drops out. */
function knownItems<T extends z.ZodType>(item: T) {
  return z
    .array(z.unknown())
    .catch([])
    .transform((items) =>
      items.filter(
        (value): value is z.output<T> => item.safeParse(value).success,
      ),
    );
}

/**
 * The filters of the recipe registry a screen keeps between visits (web: `family.recipeFilters`). Lenient by field: a
 * value an older version wrote or someone edited drops out, the rest stays.
 */
export const recipeFiltersSchema = z.object({
  tags: knownItems(tagSchema),
  times: knownItems(prepTimeRangeSchema),
  includeArchived: z.boolean().catch(false),
  sort: recipesSortSchema.catch('title'),
});

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
  sort: recipesSortSchema.default('title'),
});

export type RecipesQuery = z.infer<typeof recipesQuerySchema>;

export const recipesResponseSchema = z.object({
  recipes: z.array(recipeSummarySchema),
});

export type RecipesResponse = z.infer<typeof recipesResponseSchema>;
