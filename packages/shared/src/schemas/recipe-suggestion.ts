import { z } from 'zod';
import { suggestionSchema } from '../contracts/recipe-suggest.js';
import { slotSchema, tagSchema } from '../food/tags.js';

export const suggestionRequestStatusSchema = z.enum([
  'pending',
  'done',
  'failed',
]);

export type SuggestionRequestStatus = z.infer<
  typeof suggestionRequestStatusSchema
>;

/** One run of `recipe.suggest` by a user (GLOSSARY: Заявка за предложения). */
export const suggestionRequestSchema = z.object({
  id: z.uuid(),
  slot: slotSchema,
  maxMinutes: z.int().positive().optional(),
  tags: z.array(tagSchema),
  hint: z.string().optional(),
  status: suggestionRequestStatusSchema,
  error: z.string().optional(),
  requestedBy: z.uuid(),
  createdAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().optional(),
});

export type SuggestionRequest = z.infer<typeof suggestionRequestSchema>;

/** `verified` is reserved for a future checking contract and is not accepted yet. */
export const recipeSuggestionStatusSchema = z.enum([
  'proposed',
  'approved',
  'rejected',
]);

export type RecipeSuggestionStatus = z.infer<
  typeof recipeSuggestionStatusSchema
>;

/** One of the 3–5 recipes returned for a request (GLOSSARY: Предложение за рецепта); approval sets `recipeId`. */
export const recipeSuggestionSchema = z.object({
  id: z.uuid(),
  requestId: z.uuid(),
  payload: suggestionSchema,
  status: recipeSuggestionStatusSchema,
  recipeId: z.uuid().optional(),
  decidedBy: z.uuid().optional(),
  decidedAt: z.iso.datetime().optional(),
});

export type RecipeSuggestion = z.infer<typeof recipeSuggestionSchema>;
