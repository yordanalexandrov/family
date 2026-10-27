import { z } from 'zod';
import { contractFailureSchema } from '../contracts/failure.js';
import { contractRequestStatusSchema } from '../contracts/request.js';
import { ingredientSchema } from './ingredient.js';
import {
  importedSuggestionSchema,
  suggestionRequestsQuerySchema,
} from './recipe-suggestion.js';

/** Where an imported recipe came from; `url` is a page (ticket 2), `photo` a picture (ticket 4). */
export const recipeImportSourceSchema = z.enum(['text', 'url', 'photo']);

export type RecipeImportSource = z.infer<typeof recipeImportSourceSchema>;

/**
 * One run of `recipe.normalize` by a user (GLOSSARY: Внасяне на рецепта). `url` is the source link, if any; once done,
 * `suggestionId` and `title` are of its one suggestion; failed `no_results`, `noResults` is the agent's reason.
 */
export const recipeImportRequestSchema = z.object({
  id: z.uuid(),
  status: contractRequestStatusSchema,
  error: contractFailureSchema.optional(),
  source: recipeImportSourceSchema,
  url: z.url().optional(),
  requestedBy: z.uuid(),
  createdAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().optional(),
  suggestionId: z.uuid().optional(),
  title: z.string().optional(),
  noResults: z.string().optional(),
});

export type RecipeImportRequest = z.infer<typeof recipeImportRequestSchema>;

/** `POST /api/recipe-imports` → 202: the import, still `pending`; the run goes on in the background. */
export const recipeImportResponseSchema = z.object({
  request: recipeImportRequestSchema,
});

export type RecipeImportResponse = z.infer<typeof recipeImportResponseSchema>;

/** `GET /api/recipe-imports?limit=`: the latest imports, newest first. */
export const recipeImportsQuerySchema = suggestionRequestsQuerySchema;

export const recipeImportsResponseSchema = z.object({
  requests: z.array(recipeImportRequestSchema),
});

export type RecipeImportsResponse = z.infer<typeof recipeImportsResponseSchema>;

/**
 * `GET /api/recipe-imports/:id`: the import, its pasted text (for „Опитай пак“; only here, not in the list), its
 * suggestion once done, and the registry ingredients its lines are linked to (so the review shows them linked; an
 * ingredient deleted since is missing and its line is left to link).
 */
export const recipeImportDetailSchema = z.object({
  request: recipeImportRequestSchema,
  text: z.string().optional(),
  suggestion: importedSuggestionSchema.optional(),
  ingredients: z.array(ingredientSchema),
});

export type RecipeImportDetail = z.infer<typeof recipeImportDetailSchema>;
