import { z } from 'zod';
import { contractFailureSchema } from '../contracts/failure.js';
import { MEAL_REPLACE_MAX_CANDIDATES } from '../contracts/meal-replace.js';
import { contractRequestStatusSchema } from '../contracts/request.js';
import { instantSchema } from './dates.js';
import { refusalBody } from './error.js';

/** A recipe `meal.replace` offers for a meal, with what the sheet shows of it; picking it is a `PATCH` of the meal. */
export const mealReplaceCandidateSchema = z.object({
  recipeId: z.uuid(),
  why: z.string(),
  title: z.string(),
  prepMinutes: z.int().positive().optional(),
});

export type MealReplaceCandidate = z.infer<typeof mealReplaceCandidateSchema>;

/**
 * One run of `meal.replace` for a meal („✨ Предложи друго“, GLOSSARY: AI заявка): `candidates` once it is `done`.
 * At most one `pending` per meal.
 */
export const mealReplaceRequestSchema = z.object({
  id: z.uuid(),
  mealId: z.uuid(),
  status: contractRequestStatusSchema,
  error: contractFailureSchema.optional(),
  candidates: z
    .array(mealReplaceCandidateSchema)
    .max(MEAL_REPLACE_MAX_CANDIDATES)
    .optional(),
  requestedBy: z.uuid(),
  createdAt: instantSchema,
  finishedAt: instantSchema.optional(),
});

export type MealReplaceRequest = z.infer<typeof mealReplaceRequestSchema>;

/**
 * `POST /api/menu/meals/:id/replacements` (202), `GET /api/menu/replacements/:id` and `GET /api/menu/meals/:id/replacements`
 * (the meal's latest request).
 */
export const mealReplaceResponseSchema = z.object({
  replacement: mealReplaceRequestSchema,
});

/** Fewest recipes to choose from (tagged with the slot, not archived, not the meal's own) for a replacement. */
export const MEAL_REPLACE_MIN_RECIPES = MEAL_REPLACE_MAX_CANDIDATES;

/** 404 of `GET /api/menu/meals/:id/replacements` when nobody has asked „✨ Предложи друго“ for the meal. */
export const noReplacementSchema = refusalBody('not_found', 'no_replacement');

export type NoReplacement = z.infer<typeof noReplacementSchema>;
