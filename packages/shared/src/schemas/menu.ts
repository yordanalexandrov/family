import { z } from 'zod';
import { contractFailureSchema } from '../contracts/failure.js';
import { hintSchema } from '../contracts/hint.js';
import { contractRequestStatusSchema } from '../contracts/request.js';
import { slotSchema } from '../food/tags.js';
import { voteSchema, voteValueSchema } from '../menu/votes.js';
import { isWeekStart } from '../menu/week.js';
import { dateKeySchema, instantSchema } from './dates.js';

/** The Monday that identifies a weekly menu, as `YYYY-MM-DD`. */
export const weekStartSchema = dateKeySchema.refine(isWeekStart, {
  message: 'Седмицата започва в понеделник.',
});

/** Longest note of a meal ("ядем навън", "остатъци"). */
export const MEAL_NOTE_MAX = 80;

/** Servings of a meal per user id (GLOSSARY: Порции): a whole number, 0 for someone who is away. */
export const servingsSchema = z.record(z.uuid(), z.int().min(0));

export type Servings = z.infer<typeof servingsSchema>;

/** Longest comment in a meal's thread. */
export const MEAL_COMMENT_MAX = 500;

/** A line someone wrote, or one the API wrote for a change (`systemLine`); only system lines cannot be deleted. */
export const mealCommentKindSchema = z.enum(['comment', 'system']);

export type MealCommentKind = z.infer<typeof mealCommentKindSchema>;

/**
 * One line of a meal's thread (GLOSSARY: Разговор). A system line's `authorUserId` is who made the change and its
 * `body` is the text after the author's name.
 */
export const mealCommentSchema = z.object({
  id: z.uuid(),
  mealId: z.uuid(),
  kind: mealCommentKindSchema,
  authorUserId: z.uuid(),
  body: z.string(),
  createdAt: instantSchema,
});

export type MealComment = z.infer<typeof mealCommentSchema>;

/** `POST /api/menu/meals/:id/comments`: what the acting user writes. */
export const createMealCommentSchema = z.object({
  body: z.string().trim().min(1).max(MEAL_COMMENT_MAX),
});

export type CreateMealComment = z.infer<typeof createMealCommentSchema>;

/** `GET /api/menu/meals/:id/comments`: the whole thread, oldest first. */
export const mealCommentsResponseSchema = z.object({
  comments: z.array(mealCommentSchema),
});

export const mealCommentResponseSchema = z.object({
  comment: mealCommentSchema,
});

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
  /** The recipe as the menu shows it; an archived recipe stays visible in an old plan. `null` without a recipe. */
  recipe: z
    .object({ title: z.string(), archivedAt: instantSchema.nullable() })
    .nullable(),
  /**
   * GLOSSARY: Глас. The users' votes for the current recipe and note, by user id; the outcome is not sent, the client
   * computes it with `mealOutcome`.
   */
  votes: z.array(voteSchema),
  /** The newest line of the meal's thread (a comment or a system line), for the row; absent without one. */
  lastComment: mealCommentSchema.optional(),
  /** All lines of the thread, system lines included. */
  commentCount: z.int().min(0),
});

export type Meal = z.infer<typeof mealSchema>;

/** `PUT /api/menu/meals/:id/vote`: the acting user's vote; `DELETE` on the same path takes it back. */
export const putVoteSchema = z.object({ value: voteValueSchema });

export type PutVote = z.infer<typeof putVoteSchema>;

/** The plan for one week, Monday to Sunday (GLOSSARY: Седмично меню); at most one per `weekStart`. */
export const mealPlanSchema = z.object({
  id: z.uuid(),
  weekStart: weekStartSchema,
  summary: z.string().nullable(),
  meals: z.array(mealSchema),
  createdBy: z.uuid(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
});

export type MealPlan = z.infer<typeof mealPlanSchema>;

/** A plan without its meals, for going back through past weeks. */
export const mealPlanSummarySchema = mealPlanSchema.omit({ meals: true });

export type MealPlanSummary = z.infer<typeof mealPlanSummarySchema>;

/**
 * `GET /api/menu/plans`: `?weekStart=` asks for the plan of one week (404 without one), `?from=&to=` for the plans
 * whose week starts between the two dates, both included.
 */
export const mealPlansQuerySchema = z.union([
  z.object({ weekStart: weekStartSchema }),
  z.object({ from: dateKeySchema, to: dateKeySchema }),
]);

export type MealPlansQuery = z.infer<typeof mealPlansQuerySchema>;

export const mealPlanResponseSchema = z.object({ plan: mealPlanSchema });

export const mealPlansResponseSchema = z.object({
  plans: z.array(mealPlanSummarySchema),
});

/** `POST /api/menu/plans`: an empty plan for the week. */
export const createMealPlanSchema = z.object({ weekStart: weekStartSchema });

export type CreateMealPlan = z.infer<typeof createMealPlanSchema>;

export const mealResponseSchema = z.object({ meal: mealSchema });

/**
 * `PATCH /api/menu/meals/:id`: any of recipe, note, cook and servings; a blank note means no note. `why` only comes
 * with a recipe: the sentence of the `meal.replace` candidate that was picked; a recipe without it clears the why.
 */
export const updateMealSchema = z
  .object({
    recipeId: z.uuid().nullable(),
    why: z.string().trim().min(1),
    note: z
      .string()
      .trim()
      .max(MEAL_NOTE_MAX)
      .nullable()
      .transform((note) => note || null),
    cookUserId: z.uuid().nullable(),
    servings: servingsSchema,
  })
  .partial()
  .refine(
    (patch) => patch.why === undefined || typeof patch.recipeId === 'string',
    {
      message: 'why идва само заедно с рецепта',
      path: ['why'],
    },
  );

export type UpdateMeal = z.infer<typeof updateMealSchema>;

/**
 * One run of `menu.propose` for a week (GLOSSARY: Предложение за меню). The plan is created only when it is `done`
 * (`planId`); `error` uses the same failure codes as `recipe.suggest`.
 */
export const menuProposalRequestSchema = z.object({
  id: z.uuid(),
  weekStart: weekStartSchema,
  hint: z.string().optional(),
  status: contractRequestStatusSchema,
  error: contractFailureSchema.optional(),
  requestedBy: z.uuid(),
  planId: z.uuid().optional(),
  createdAt: instantSchema,
  finishedAt: instantSchema.optional(),
});

export type MenuProposalRequest = z.infer<typeof menuProposalRequestSchema>;

/** `POST /api/menu/proposals`. */
export const createMenuProposalSchema = z.object({
  weekStart: weekStartSchema,
  hint: hintSchema.optional(),
});

export type CreateMenuProposal = z.infer<typeof createMenuProposalSchema>;

export const menuProposalResponseSchema = z.object({
  proposal: menuProposalRequestSchema,
});

/** Fewest dinner recipes in the registry (not archived) that a proposal can choose 7 different dinners from. */
export const MENU_PROPOSE_MIN_RECIPES = 7;

/**
 * 409 of `POST /api/menu/proposals` when the registry is too small: `have` dinner recipes, `need` at least; the UI
 * asks for `need - have` more.
 */
export const notEnoughRecipesSchema = z.object({
  error: z.literal('conflict'),
  code: z.literal('not_enough_recipes'),
  message: z.string(),
  have: z.int().min(0),
  need: z.int().positive(),
});

export type NotEnoughRecipes = z.infer<typeof notEnoughRecipesSchema>;
