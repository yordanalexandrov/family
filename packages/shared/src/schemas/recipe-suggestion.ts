import { z } from 'zod';
import { contractFailureSchema } from '../contracts/failure.js';
import { normalizedRecipeSchema } from '../contracts/recipe-normalize.js';
import { suggestionSchema } from '../contracts/recipe-suggest.js';
import { contractRequestStatusSchema } from '../contracts/request.js';
import { prepTimeRangeSchema } from '../food/prep-time.js';
import { slotSchema, tagSchema } from '../food/tags.js';
import { recipeInputSchema, recipeSchema, recipeStepSchema } from './recipe.js';

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

/**
 * A recipe in the registry (not archived) with the suggestion's title, compared canonically (trimmed, lower case,
 * single spaces), as reads of a proposed suggestion give it; the review warns before a second recipe of that title.
 */
export const duplicateOfSchema = z.object({ id: z.uuid(), title: z.string() });

export type DuplicateOf = z.infer<typeof duplicateOfSchema>;

/** Worked out when a proposed suggestion is read, not stored. */
const readFields = {
  duplicateOf: duplicateOfSchema.optional(),
};

/**
 * A `Suggestion` of `recipe.suggest` as a suggestion stores it: its steps are step objects (with a place for a photo),
 * not the contract's text.
 */
export const suggestionPayloadSchema = suggestionSchema.extend({
  steps: z.array(recipeStepSchema).min(2),
});

export type SuggestionPayload = z.infer<typeof suggestionPayloadSchema>;

/**
 * A `NormalizedRecipe` of `recipe.normalize` as an import's suggestion stores it: its steps are step objects (with a
 * place for a photo), not the contract's text.
 */
export const importPayloadSchema = normalizedRecipeSchema.extend({
  steps: z.array(recipeStepSchema).min(1),
});

export type ImportPayload = z.infer<typeof importPayloadSchema>;

/** One of the 3–5 recipes returned for a suggestion request (GLOSSARY: Предложение за рецепта). */
export const recipeSuggestionSchema = z.object({
  ...decisionFields,
  ...readFields,
  origin: z.literal('suggest'),
  requestId: z.uuid(),
  payload: suggestionPayloadSchema,
});

export type RecipeSuggestion = z.infer<typeof recipeSuggestionSchema>;

/** The one recipe of an import (GLOSSARY: Внасяне на рецепта, Предложение за рецепта). */
export const importedSuggestionSchema = z.object({
  ...decisionFields,
  ...readFields,
  origin: z.literal('import'),
  importRequestId: z.uuid(),
  payload: importPayloadSchema,
});

export type ImportedSuggestion = z.infer<typeof importedSuggestionSchema>;

/**
 * A recipe suggestion of either origin, as approval and rejection return it (`/api/recipe-suggestions/:id/…` take both):
 * `payload` is a `SuggestionPayload` (of `recipe.suggest`) or an `ImportPayload` (of `recipe.normalize`).
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

/**
 * `POST /api/recipe-suggestions/:id/approve`: the (edited) recipe. Without `appliance` the recipe takes the suggestion's,
 * `null` is none (the user chose „Без уред“).
 */
export const approveSuggestionInputSchema = recipeInputSchema.extend({
  appliance: recipeInputSchema.shape.appliance.unwrap().nullable().optional(),
  /** The revision the review form holds (GLOSSARY: Поправка на рецепта); the approval marks it `accepted`. */
  revisionId: z.uuid().optional(),
});

export type ApproveSuggestionInput = z.infer<
  typeof approveSuggestionInputSchema
>;

/** `POST /api/recipe-suggestions/:id/approve` → 201: the new registry recipe and the approved suggestion. */
export const approvedSuggestionResponseSchema = z.object({
  recipe: recipeSchema,
  suggestion: anyRecipeSuggestionSchema,
});

export type ApprovedSuggestionResponse = z.infer<
  typeof approvedSuggestionResponseSchema
>;
