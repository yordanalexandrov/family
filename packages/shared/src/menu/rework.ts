import type { DateKey } from '../dashboard/time.js';
import { isEmptyMeal } from './meal.js';
import { isPastMeal, type VotedMeal } from './votes.js';

/**
 * What the menu rework (GLOSSARY: Преработка на менюто) does with a day: `past` is history the agent only reads,
 * `keep` stays as it is, `fill` gets a new recipe from the agent.
 */
export type ReworkStatus = 'past' | 'keep' | 'fill';

/**
 * Why a day is filled: `vetoed` (at least one „против“; its recipe is barred from the week), `unvoted` (nobody voted
 * for it) or `empty` (neither a recipe nor a note). The first two replace a meal, the last fills a gap.
 */
export type ReworkReason = 'vetoed' | 'unvoted' | 'empty';

/** One day of the week as the rework sees it; `reason` only for `fill`. */
export interface ReworkDay<M> {
  meal: M;
  status: ReworkStatus;
  reason?: ReworkReason;
}

/**
 * Classifies each meal of a week for the rework, in the order given, checked in this order: before `today` (Sofia) →
 * `past`; empty → `fill`/`empty`; any „против“ → `fill`/`vetoed`; only a note → `keep`; any „за“ → `keep`; else
 * `fill`/`unvoted`. Today is still to come. The api builds the agent's input and applies the answer by it, the web
 * shows the preview and the button by it.
 */
export function classifyRework<M extends VotedMeal & { date: DateKey }>(
  meals: readonly M[],
  today: DateKey,
): ReworkDay<M>[] {
  return meals.map((meal) => {
    if (isPastMeal(meal, today)) {
      return { meal, status: 'past' };
    }
    if (isEmptyMeal(meal)) {
      return { meal, status: 'fill', reason: 'empty' };
    }
    if (meal.votes.some((vote) => vote.value === 'down')) {
      return { meal, status: 'fill', reason: 'vetoed' };
    }
    if (meal.recipeId === null) {
      return { meal, status: 'keep' };
    }
    if (meal.votes.some((vote) => vote.value === 'up')) {
      return { meal, status: 'keep' };
    }
    return { meal, status: 'fill', reason: 'unvoted' };
  });
}

/**
 * „Остават N · сменят се M · попълват се K“: the kept days, the replaced ones (`vetoed`, `unvoted`) and the filled
 * ones (`empty`); past days are not counted. The rework has something to do when `replace + fill > 0`.
 */
export function reworkCounts(days: readonly ReworkDay<unknown>[]): {
  keep: number;
  replace: number;
  fill: number;
} {
  return {
    keep: days.filter((day) => day.status === 'keep').length,
    replace: days.filter(
      (day) => day.status === 'fill' && day.reason !== 'empty',
    ).length,
    fill: days.filter((day) => day.reason === 'empty').length,
  };
}
