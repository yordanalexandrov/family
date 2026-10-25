import { z } from 'zod';
import { suggestionSchema } from '../contracts/recipe-suggest.js';
import { slotSchema, tagSchema } from '../food/tags.js';
import { recipeSchema } from './recipe.js';

export const suggestionRequestStatusSchema = z.enum([
  'pending',
  'done',
  'failed',
]);

export type SuggestionRequestStatus = z.infer<
  typeof suggestionRequestStatusSchema
>;

/**
 * Why a request ended `failed` (its `error`): `timeout`, `invalid_output` (two invalid answers), `http_<status>`
 * (the gateway answered an error), `aborted` (the api shut down), `stale` (cut off by a restart) or `error` (a bug).
 */
export const SUGGESTION_FAILURES = [
  'timeout',
  'invalid_output',
  'aborted',
  'stale',
  'error',
] as const;

export const suggestionFailureSchema = z.union([
  z.enum(SUGGESTION_FAILURES),
  z.templateLiteral(['http_', z.int()]),
]);

export type SuggestionFailure = z.infer<typeof suggestionFailureSchema>;

/** One run of `recipe.suggest` by a user (GLOSSARY: Заявка за предложения). */
export const suggestionRequestSchema = z.object({
  id: z.uuid(),
  slot: slotSchema,
  maxMinutes: z.int().positive().optional(),
  tags: z.array(tagSchema),
  hint: z.string().optional(),
  status: suggestionRequestStatusSchema,
  error: suggestionFailureSchema.optional(),
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
  suggestion: recipeSuggestionSchema,
});

export type RecipeSuggestionResponse = z.infer<
  typeof recipeSuggestionResponseSchema
>;

/** `POST /api/recipe-suggestions/:id/approve` → 201: the new registry recipe and the approved suggestion. */
export const approvedSuggestionResponseSchema = z.object({
  recipe: recipeSchema,
  suggestion: recipeSuggestionSchema,
});

export type ApprovedSuggestionResponse = z.infer<
  typeof approvedSuggestionResponseSchema
>;
