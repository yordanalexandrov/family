import { z } from 'zod';
import { contractFailureSchema } from '../contracts/failure.js';
import {
  newProductSchema,
  normalizedIngredientFields,
} from '../contracts/recipe-normalize.js';
import { refineRecipeSchema } from '../contracts/recipe-refine.js';
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
 * One run of `recipe.revise` for a recipe of the registry (`recipeId`) or a suggestion waiting for approval
 * (`suggestionId`), exactly one of the two: the instruction, then `revision` once it is `done`; failed `no_results` with
 * the agent's reason in `noResults`. `requestedBy` and the decider may be none (the kiosk). `stale`: the recipe was saved
 * after the revision was asked for, so accepting it would undo that save; always `false` for a suggestion.
 */
export const recipeRevisionRequestSchema = z.object({
  id: z.uuid(),
  recipeId: z.uuid().optional(),
  suggestionId: z.uuid().optional(),
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

const revisionInstructionBody = z.object({
  instruction: revisionInstructionSchema,
});

/**
 * `POST /api/recipes/:id/revisions`: the instruction and `applied`, the questions in Готвене whose cooking changes were
 * applied in the last cooking of the recipe on this device today (GLOSSARY: Промяна за готвенето), in the order they
 * were applied. 404 `no_applied_change` (`noAppliedChangeSchema`) when some are not questions of the recipe with a
 * change.
 */
export const requestRevisionSchema = revisionInstructionBody.extend({
  applied: z.array(z.uuid()).default([]),
});

export type RequestRevision = z.infer<typeof requestRevisionSchema>;

/** What the client sends: `applied` may be left out when nothing was applied. */
export type RequestRevisionBody = z.input<typeof requestRevisionSchema>;

/**
 * The recipe of a suggestion's review form as „✏️ Поправи с AI“ sends it, for the form is not saved: the products by
 * name (a line may be not yet linked), the steps with the photos they have.
 */
export const revisableRecipeSchema = refineRecipeSchema
  .omit({ steps: true })
  .extend({ steps: z.array(recipeStepSchema).min(1) });

export type RevisableRecipe = z.infer<typeof revisableRecipeSchema>;

/** `POST /api/recipe-suggestions/:id/revisions`. */
export const requestSuggestionRevisionSchema = revisionInstructionBody.extend({
  recipe: revisableRecipeSchema,
});

export type RequestSuggestionRevision = z.infer<
  typeof requestSuggestionRevisionSchema
>;

/**
 * `POST /api/recipes/:id/revisions` (202), `GET /api/recipes/revisions/:id` and `POST /api/recipes/revisions/:id/reject`.
 */
export const recipeRevisionResponseSchema = z.object({
  request: recipeRevisionRequestSchema,
});

export type RecipeRevisionResponse = z.infer<
  typeof recipeRevisionResponseSchema
>;

/** 409 `revision_open`: the recipe or suggestion already has an open revision, the one in `revisionId`. */
export const revisionOpenSchema = refusalBody('conflict', 'revision_open', {
  revisionId: z.uuid(),
});
