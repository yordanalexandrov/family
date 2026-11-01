import { z } from 'zod';
import { contractFailureSchema } from '../contracts/failure.js';
import { contractRequestStatusSchema } from '../contracts/request.js';
import { preparationSchema } from '../food/preparation.js';
import { instantSchema } from './dates.js';
import { recipeStepSchema } from './recipe.js';

/**
 * What the refinement read of the recipe's source: its page (`read`), a link whose page did not open (`unread`), or
 * no link (`none`). Without a page there are no new photos.
 */
export const refinementSourceSchema = z.enum(['read', 'unread', 'none']);

export type RefinementSource = z.infer<typeof refinementSourceSchema>;

/**
 * The refined recipe as the review shows it and „Приеми“ puts it in the form: the new steps (the photos the recipe had
 * kept by id, the source's stored as new photos), the time when the recipe had none, the whole preparation anew (it
 * replaces the recipe's), and what changed. `droppedPhotos` counts the photos of the source the agent chose that did
 * not download or are not pictures. A refinement stored before the preparation has none: it leaves the recipe's as it is.
 */
export const recipeRefinementSchema = z.object({
  steps: z.array(recipeStepSchema).min(1),
  prepMinutes: z.int().positive().optional(),
  /** Absent only in a refinement stored before the preparation; then „Приеми“ leaves the recipe's preparation alone. */
  preparation: preparationSchema.optional(),
  changes: z.string(),
  source: refinementSourceSchema,
  droppedPhotos: z.int().nonnegative(),
});

export type RecipeRefinement = z.infer<typeof recipeRefinementSchema>;

/**
 * One run of `recipe.refine` for a recipe („Подобри рецептата“, GLOSSARY: Подобряване на рецепта): `refinement` once it
 * is `done`; failed `no_results`, `noResults` is the agent's reason (the recipe is fine as it is). At most one
 * `pending` per recipe.
 */
export const recipeRefineRequestSchema = z.object({
  id: z.uuid(),
  recipeId: z.uuid(),
  status: contractRequestStatusSchema,
  error: contractFailureSchema.optional(),
  refinement: recipeRefinementSchema.optional(),
  noResults: z.string().optional(),
  requestedBy: z.uuid(),
  createdAt: instantSchema,
  finishedAt: instantSchema.optional(),
});

export type RecipeRefineRequest = z.infer<typeof recipeRefineRequestSchema>;

/** `POST /api/recipes/:id/refinements` (202) and `GET /api/recipes/refinements/:id`. */
export const recipeRefineResponseSchema = z.object({
  request: recipeRefineRequestSchema,
});

export type RecipeRefineResponse = z.infer<typeof recipeRefineResponseSchema>;
