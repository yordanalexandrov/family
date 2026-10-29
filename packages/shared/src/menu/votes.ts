import { z } from 'zod';
import type { DateKey } from '../dashboard/time.js';
import { isEmptyMeal, type MealContent } from './meal.js';

/** GLOSSARY: Глас. „за“ (`up`, the meal stays) or „против“ (`down`, it is to be replaced). */
export const voteValueSchema = z.enum(['up', 'down']);

export type VoteValue = z.infer<typeof voteValueSchema>;

/** One user's vote for a meal; at most one per user and meal, for the meal's current recipe and note. */
export const voteSchema = z.object({
  userId: z.uuid(),
  value: voteValueSchema,
});

export type Vote = z.infer<typeof voteSchema>;

/**
 * GLOSSARY: Изход на ястие. `keep` (Остава), `replace` (За смяна), `discuss` (Да поговорим), `pending` (Чака глас).
 * Computed, never stored.
 */
export const MEAL_OUTCOMES = ['keep', 'replace', 'discuss', 'pending'] as const;

export type MealOutcome = (typeof MEAL_OUTCOMES)[number];

/** What the outcome of a meal is computed from: its content (an empty day is never `keep`) and its votes. */
export interface VotedMeal extends MealContent {
  votes: readonly Vote[];
}

/**
 * The outcome of the votes of `userIds`: both up → keep, both down → replace, one of each → discuss, else pending. An
 * empty day (GLOSSARY: Ястие, without a recipe and a note) is pending whatever its votes: there is nothing to keep.
 */
export function mealOutcome(
  { votes, ...content }: VotedMeal,
  userIds: readonly string[],
): MealOutcome {
  if (isEmptyMeal(content)) {
    return 'pending';
  }
  const values = userIds.map(
    (id) => votes.find((vote) => vote.userId === id)?.value,
  );
  if (values.some((value) => value === undefined)) {
    return 'pending';
  }
  if (values.every((value) => value === 'up')) {
    return 'keep';
  }
  if (values.every((value) => value === 'down')) {
    return 'replace';
  }
  return 'discuss';
}

/** A meal before `today` (a day in Sofia): no votes and no change of its recipe or note any more. */
export function isPastMeal(meal: { date: DateKey }, today: DateKey): boolean {
  return meal.date < today;
}

/** The meals from `today` on whose outcome is not `keep` yet, in the order given. */
export function mealsToAgree<T extends VotedMeal & { date: DateKey }>(
  meals: readonly T[],
  userIds: readonly string[],
  today: DateKey,
): T[] {
  return meals.filter(
    (meal) => !isPastMeal(meal, today) && mealOutcome(meal, userIds) !== 'keep',
  );
}

/**
 * GLOSSARY: Съгласувано меню. Every meal from `today` on is `keep`, so none of them is empty; past days take no part.
 * Computed, never stored.
 */
export function isAgreed(
  meals: readonly (VotedMeal & { date: DateKey })[],
  userIds: readonly string[],
  today: DateKey,
): boolean {
  return mealsToAgree(meals, userIds, today).length === 0;
}
