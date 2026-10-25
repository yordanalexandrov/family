import { z } from 'zod';
import { slotSchema, tagSchema } from '../food/tags.js';
import {
  checkPinchQuantity,
  quantitySchema,
  unitSchema,
} from '../food/units.js';
import { nutritionSchema } from '../schemas/recipe.js';

/**
 * AI contract `recipe.suggest` (GLOSSARY: AI контракт): fixed JSON in → 3–5 normalized recipes out,
 * validated in the API. Everything the agent writes is in Bulgarian.
 */

/** What the client asks for (GLOSSARY: Заявка за предложения). */
export const recipeSuggestParamsSchema = z.object({
  slot: slotSchema,
  maxMinutes: z.int().positive().optional(),
  tags: z.array(tagSchema).optional(),
  hint: z.string().trim().max(200).optional(),
});

export type RecipeSuggestParams = z.infer<typeof recipeSuggestParamsSchema>;

/** The contract input: the client request plus the registry context the API adds. */
export const recipeSuggestInputSchema = recipeSuggestParamsSchema.extend({
  existingRecipeTitles: z.array(z.string()),
  ingredientNames: z.array(z.string()),
});

export type RecipeSuggestInput = z.infer<typeof recipeSuggestInputSchema>;

/** An ingredient as the agent writes it: by name, `isNew` when it is not one of `ingredientNames`. */
export const suggestionIngredientSchema = z
  .object({
    name: z.string().trim().min(1),
    isNew: z.boolean(),
    quantity: quantitySchema,
    unit: unitSchema,
  })
  .superRefine(checkPinchQuantity);

export type SuggestionIngredient = z.infer<typeof suggestionIngredientSchema>;

/** One normalized recipe from the internet (GLOSSARY: Предложение за рецепта). */
export const suggestionSchema = z.object({
  title: z.string().trim().min(1),
  sourceUrl: z.url(),
  why: z.string().trim().min(1),
  prepMinutes: z.int().positive(),
  servings: z.int().min(1),
  tags: z.array(tagSchema),
  ingredients: z.array(suggestionIngredientSchema).min(1),
  steps: z.array(z.string().trim().min(1)).min(1),
  nutritionPer100g: nutritionSchema.optional(),
});

export type Suggestion = z.infer<typeof suggestionSchema>;

export const recipeSuggestOutputSchema = z.object({
  suggestions: z.array(suggestionSchema).min(3).max(5),
});

export type RecipeSuggestOutput = z.infer<typeof recipeSuggestOutputSchema>;

/**
 * JSON Schema of the output for `response_format: { type: 'json_schema' }`. Refinements
 * (a pinch has no quantity) are not expressible there; the API still parses with the Zod schema.
 */
export const RECIPE_SUGGEST_RESPONSE_JSON_SCHEMA = z.toJSONSchema(
  recipeSuggestOutputSchema,
  { io: 'output', unrepresentable: 'any' },
);
