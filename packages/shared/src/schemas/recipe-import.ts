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

/** The longest `firstLine` of an import. */
export const IMPORT_FIRST_LINE_MAX = 80;

/**
 * One run of `recipe.normalize` by a user (GLOSSARY: Внасяне на рецепта). `url` is the source link, if any; once done,
 * `suggestionId` and `title` are of its one suggestion; failed `no_results`, `noResults` is the agent's reason.
 * `firstLine` is the first non-empty line of pasted text, trimmed and cut to `IMPORT_FIRST_LINE_MAX` characters, so
 * the list tells text imports apart (the whole text is only in the detail).
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
  firstLine: z.string().max(IMPORT_FIRST_LINE_MAX).optional(),
});

export type RecipeImportRequest = z.infer<typeof recipeImportRequestSchema>;

/**
 * `POST /api/recipe-imports` → 409 `already_imported`: the link (by `normalizeSourceUrl`) is already the source of a
 * recipe that is not archived, or of a proposed suggestion; `requestId` (`recipe.suggest`) or `importRequestId` says
 * where that suggestion opens. Sent again with `force: true`, the link is imported anyway.
 */
export const alreadyImportedSchema = z.object({
  error: z.literal('already_imported'),
  message: z.string(),
  recipe: z.object({ id: z.uuid(), title: z.string() }).optional(),
  suggestion: z
    .object({
      id: z.uuid(),
      title: z.string(),
      requestId: z.uuid().optional(),
      importRequestId: z.uuid().optional(),
    })
    .optional(),
});

export type AlreadyImported = z.infer<typeof alreadyImportedSchema>;

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
