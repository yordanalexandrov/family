import { z } from 'zod';
import { contractFailureSchema } from '../contracts/failure.js';
import { normalizedRecipeSchema } from '../contracts/recipe-normalize.js';
import { suggestionSchema } from '../contracts/recipe-suggest.js';
import { contractRequestStatusSchema } from '../contracts/request.js';
import { prepTimeRangeSchema } from '../food/prep-time.js';
import { slotSchema, tagSchema } from '../food/tags.js';
import { recipeSchema } from './recipe.js';

/** One run of `recipe.suggest` by a user (GLOSSARY: Заявка за предложения). */
export const suggestionRequestSchema = z.object({
  id: z.uuid(),
  slots: z.array(slotSchema).min(1),
  times: z.array(prepTimeRangeSchema),
  tags: z.array(tagSchema),
  hint: z.string().optional(),
  status: contractRequestStatusSchema,
  error: contractFailureSchema.optional(),
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

/** What every recipe suggestion has, whichever AI request made it; approval sets `recipeId`. */
const decisionFields = {
  id: z.uuid(),
  status: recipeSuggestionStatusSchema,
  recipeId: z.uuid().optional(),
  decidedBy: z.uuid().optional(),
  decidedAt: z.iso.datetime().optional(),
};

/** One of the 3–5 recipes returned for a suggestion request (GLOSSARY: Предложение за рецепта). */
export const recipeSuggestionSchema = z.object({
  ...decisionFields,
  origin: z.literal('suggest'),
  requestId: z.uuid(),
  payload: suggestionSchema,
});

export type RecipeSuggestion = z.infer<typeof recipeSuggestionSchema>;

/** The one recipe of an import (GLOSSARY: Внасяне на рецепта, Предложение за рецепта). */
export const importedSuggestionSchema = z.object({
  ...decisionFields,
  origin: z.literal('import'),
  importRequestId: z.uuid(),
  payload: normalizedRecipeSchema,
});

export type ImportedSuggestion = z.infer<typeof importedSuggestionSchema>;

/**
 * A recipe suggestion of either origin, as approval and rejection return it (`/api/recipe-suggestions/:id/…` take both):
 * `payload` is a `Suggestion` of `recipe.suggest` or a `NormalizedRecipe` of `recipe.normalize`.
 */
export const anyRecipeSuggestionSchema = z.discriminatedUnion('origin', [
  recipeSuggestionSchema,
  importedSuggestionSchema,
]);

export type AnyRecipeSuggestion = z.infer<typeof anyRecipeSuggestionSchema>;

/** `POST /api/recipe-suggestions/requests` → 202: the request, still `pending`; the run goes on in the background. */
export const suggestionRequestResponseSchema = z.object({
  request: suggestionRequestSchema,
});

export type SuggestionRequestResponse = z.infer<
  typeof suggestionRequestResponseSchema
>;

/** `GET /api/recipe-suggestions/requests?limit=`: the latest requests, newest first. */
export const suggestionRequestsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type SuggestionRequestsQuery = z.infer<
  typeof suggestionRequestsQuerySchema
>;

export const suggestionRequestsResponseSchema = z.object({
  requests: z.array(suggestionRequestSchema),
});

export type SuggestionRequestsResponse = z.infer<
  typeof suggestionRequestsResponseSchema
>;

/** `GET /api/recipe-suggestions/requests/:id`: the request and its suggestions in the agent's order. */
export const suggestionRequestDetailSchema = z.object({
  request: suggestionRequestSchema,
  suggestions: z.array(recipeSuggestionSchema),
});

export type SuggestionRequestDetail = z.infer<
  typeof suggestionRequestDetailSchema
>;

/** `POST /api/recipe-suggestions/:id/reject`, and the body of a 409 when the suggestion was already decided. */
export const recipeSuggestionResponseSchema = z.object({
  suggestion: anyRecipeSuggestionSchema,
});

export type RecipeSuggestionResponse = z.infer<
  typeof recipeSuggestionResponseSchema
>;

/** `POST /api/recipe-suggestions/:id/approve` → 201: the new registry recipe and the approved suggestion. */
export const approvedSuggestionResponseSchema = z.object({
  recipe: recipeSchema,
  suggestion: anyRecipeSuggestionSchema,
});

export type ApprovedSuggestionResponse = z.infer<
  typeof approvedSuggestionResponseSchema
>;
