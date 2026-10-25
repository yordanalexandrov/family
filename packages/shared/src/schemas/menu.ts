import { z } from 'zod';
import { slotSchema } from '../food/tags.js';
import { isWeekStart } from '../menu/week.js';
import { dateKeySchema } from './dates.js';
import { suggestionFailureSchema } from './recipe-suggestion.js';

/** The Monday that identifies a weekly menu, as `YYYY-MM-DD`. */
export const weekStartSchema = dateKeySchema.refine(isWeekStart, {
  message: 'Седмицата започва в понеделник.',
});

/** Longest note of a meal ("ядем навън", "остатъци"). */
export const MEAL_NOTE_MAX = 80;

/** Servings of a meal per user id (GLOSSARY: Порции): a whole number, 0 for someone who is away. */
export const servingsSchema = z.record(z.uuid(), z.int().min(0));

export type Servings = z.infer<typeof servingsSchema>;

/**
 * One line of a weekly menu (GLOSSARY: Ястие): a recipe from the registry, a note instead of (or next to) it, or
 * empty. `why` is the agent's one sentence; the API clears it when the recipe is changed by hand.
 */
export const mealSchema = z.object({
  id: z.uuid(),
  planId: z.uuid(),
  date: dateKeySchema,
  slot: slotSchema,
  recipeId: z.uuid().nullable(),
  note: z.string().max(MEAL_NOTE_MAX).nullable(),
  cookUserId: z.uuid().nullable(),
  servings: servingsSchema,
  why: z.string().nullable(),
});

export type Meal = z.infer<typeof mealSchema>;

/** The plan for one week, Monday to Sunday (GLOSSARY: Седмично меню); at most one per `weekStart`. */
export const mealPlanSchema = z.object({
  id: z.uuid(),
  weekStart: weekStartSchema,
  summary: z.string().nullable(),
  meals: z.array(mealSchema),
  createdBy: z.uuid(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type MealPlan = z.infer<typeof mealPlanSchema>;

/** `PATCH /api/menu/meals/:id`: any of recipe, note, cook and servings; a blank note means no note. */
export const updateMealSchema = z
  .object({
    recipeId: z.uuid().nullable(),
    note: z
      .string()
      .trim()
      .max(MEAL_NOTE_MAX)
      .nullable()
      .transform((note) => note || null),
    cookUserId: z.uuid().nullable(),
    servings: servingsSchema,
  })
  .partial();

export type UpdateMeal = z.infer<typeof updateMealSchema>;

export const menuProposalStatusSchema = z.enum(['pending', 'done', 'failed']);

export type MenuProposalStatus = z.infer<typeof menuProposalStatusSchema>;

/**
 * One run of `menu.propose` for a week (GLOSSARY: Предложение за меню). The plan is created only when it is `done`
 * (`planId`); `error` uses the same failure codes as `recipe.suggest`.
 */
export const menuProposalRequestSchema = z.object({
  id: z.uuid(),
  weekStart: weekStartSchema,
  hint: z.string().optional(),
  status: menuProposalStatusSchema,
  error: suggestionFailureSchema.optional(),
  requestedBy: z.uuid(),
  planId: z.uuid().optional(),
  createdAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().optional(),
});

export type MenuProposalRequest = z.infer<typeof menuProposalRequestSchema>;

/** `POST /api/menu/proposals`. */
export const createMenuProposalSchema = z.object({
  weekStart: weekStartSchema,
  hint: z.string().trim().max(200).optional(),
});

export type CreateMenuProposal = z.infer<typeof createMenuProposalSchema>;
