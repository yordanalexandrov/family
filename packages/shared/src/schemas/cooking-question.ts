import { z } from 'zod';
import { cookingQuestionTextSchema } from '../contracts/cooking-ask.js';
import { contractFailureSchema } from '../contracts/failure.js';
import { contractRequestStatusSchema } from '../contracts/request.js';
import { cookingChangeSchema } from '../food/cooking-change.js';
import { instantSchema } from './dates.js';

/**
 * `POST /api/recipes/:id/questions` (GLOSSARY: Въпрос в Готвене): the question, the step on the screen (its index, from
 * 0, as Готвене keeps it), the servings on the screen and, for a follow-up, `follows`: the earlier question of the same
 * recipe it goes on from (the chain). `applied` are the questions of the recipe whose cooking changes are applied on
 * the screen (GLOSSARY: Промяна за готвенето), in the order they were applied.
 */
export const askCookingQuestionSchema = z.object({
  question: cookingQuestionTextSchema,
  step: z.int().min(0),
  servings: z.int().min(1),
  follows: z.uuid().optional(),
  applied: z.array(z.uuid()).default([]),
});

export type AskCookingQuestion = z.infer<typeof askCookingQuestionSchema>;

/** What the client sends: `applied` may be left out when nothing is applied. */
export type AskCookingQuestionBody = z.input<typeof askCookingQuestionSchema>;

/**
 * One run of `cooking.ask` for a recipe (GLOSSARY: Въпрос в Готвене): what was asked, at which step and servings, what it
 * follows, and `answer` once it is `done`, with the cooking change it brings, if any (`change`, for `servings`). `requestedBy` is `null` for a question from the kiosk, which has no acting user.
 */
export const cookingQuestionSchema = z.object({
  id: z.uuid(),
  recipeId: z.uuid(),
  question: z.string(),
  step: z.int().min(0),
  servings: z.int().min(1),
  /** The earlier question this one goes on from; none for the first of a chain. */
  follows: z.uuid().optional(),
  status: contractRequestStatusSchema,
  error: contractFailureSchema.optional(),
  answer: z.string().optional(),
  change: cookingChangeSchema.optional(),
  requestedBy: z.uuid().nullable(),
  createdAt: instantSchema,
  finishedAt: instantSchema.optional(),
});

export type CookingQuestion = z.infer<typeof cookingQuestionSchema>;

/** `POST /api/recipes/:id/questions` (202) and `GET /api/recipes/questions/:id`. */
export const cookingQuestionResponseSchema = z.object({
  request: cookingQuestionSchema,
});

export type CookingQuestionResponse = z.infer<
  typeof cookingQuestionResponseSchema
>;
