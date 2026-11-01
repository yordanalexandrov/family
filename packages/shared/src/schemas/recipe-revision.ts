import { z } from 'zod';
import { contractFailureSchema } from '../contracts/failure.js';
import {
  newProductSchema,
  normalizedIngredientFields,
} from '../contracts/recipe-normalize.js';
import { revisionInstructionSchema } from '../contracts/recipe-revise.js';
import { contractRequestStatusSchema } from '../contracts/request.js';
import { preparationSchema } from '../food/preparation.js';
import { instantSchema } from './dates.js';
import { refusalBody } from './error.js';
import { ingredientSchema } from './ingredient.js';
import { recipeStepSchema } from './recipe.js';

/**
 * A line of a revised recipe: the registry product it is linked to (as it was when the revision was done), or the new
 * product the agent proposes, which the person creates before saving (as for an import). Exactly one of the two.
 */
export const revisionLineSchema = z.object({
  ingredient: ingredientSchema.optional(),
  newProduct: newProductSchema.optional(),
  quantity: normalizedIngredientFields.quantity,
  unit: normalizedIngredientFields.unit,
  note: z.string().optional(),
});

export type RevisionLine = z.infer<typeof revisionLineSchema>;

/**
 * The revised recipe as the review shows it and „Приеми“ puts it in the form (GLOSSARY: Поправка на рецепта): the
 * whole recipe but its title, tags and appliance, the photos the recipe had kept by id, and what changed.
 * `droppedPhotos` counts the photos of the recipe no step of the revision keeps.
 */
export const recipeRevisionSchema = z.object({
  changes: z.string(),
  servings: z.int().min(1),
  prepMinutes: z.int().positive().optional(),
  ingredients: z.array(revisionLineSchema),
  steps: z.array(recipeStepSchema).min(1),
  preparation: preparationSchema,
  droppedPhotos: z.int().nonnegative(),
});

export type RecipeRevision = z.infer<typeof recipeRevisionSchema>;

/** What the person did with a revision: saved the recipe with it, or „Отхвърли“. */
export const revisionDecisionSchema = z.enum(['accepted', 'rejected']);

export type RevisionDecision = z.infer<typeof revisionDecisionSchema>;

/**
 * One run of `recipe.revise` for a recipe of the registry: the instruction, then `revision` once it is `done`; failed
 * `no_results` with the agent's reason in `noResults`. `requestedBy` and the decider may be none (the kiosk). `stale`: the
 * recipe was saved after the revision was asked for, so accepting it would undo that save.
 */
export const recipeRevisionRequestSchema = z.object({
  id: z.uuid(),
  recipeId: z.uuid(),
  instruction: z.string(),
  status: contractRequestStatusSchema,
  error: contractFailureSchema.optional(),
  revision: recipeRevisionSchema.optional(),
  noResults: z.string().optional(),
  decision: revisionDecisionSchema.optional(),
  requestedBy: z.uuid().nullable(),
  createdAt: instantSchema,
  finishedAt: instantSchema.optional(),
  stale: z.boolean(),
});

export type RecipeRevisionRequest = z.infer<typeof recipeRevisionRequestSchema>;

/** `POST /api/recipes/:id/revisions`. */
export const requestRevisionSchema = z.object({
  instruction: revisionInstructionSchema,
});

export type RequestRevision = z.infer<typeof requestRevisionSchema>;

/**
 * `POST /api/recipes/:id/revisions` (202), `GET /api/recipes/revisions/:id` and `POST /api/recipes/revisions/:id/reject`.
 */
export const recipeRevisionResponseSchema = z.object({
  request: recipeRevisionRequestSchema,
});

export type RecipeRevisionResponse = z.infer<
  typeof recipeRevisionResponseSchema
>;

/**
 * 409 of `POST /api/recipes/:id/revisions` while the recipe has an open revision (GLOSSARY: Поправка на рецепта):
 * `revisionId` is that one, so the sheet leads to it.
 */
export const revisionOpenSchema = refusalBody('conflict', 'revision_open', {
  revisionId: z.uuid(),
});
