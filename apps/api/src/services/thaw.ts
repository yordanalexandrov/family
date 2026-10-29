import {
  addDays,
  atHourInSofia,
  type DateKey,
  dateKeyInSofia,
} from '@family/shared';
import type { ReminderMeal } from '../db/repositories/reminders.js';

/** „Извади месото“ comes at these hours in Sofia: the evening before the dinner and its morning. Changed by PR. */
export const THAW_EVENING_HOUR = 20;
export const THAW_MORNING_HOUR = 8;

/** A dinner to take meat out of the freezer for, with its products „Във фризера“ in the recipe's order. */
export interface ThawCandidate {
  meal: ReminderMeal;
  products: string[];
}

/** The dinners „Извади месото“ is about at `now`: today's all day, tomorrow's from {@link THAW_EVENING_HOUR}. */
export function thawDates(now: Date): DateKey[] {
  const today = dateKeyInSofia(now);
  return now.getTime() >= atHourInSofia(today, THAW_EVENING_HOUR)
    ? [today, addDays(today, 1)]
    : [today];
}

/**
 * „Извади месото“ at `now` (GLOSSARY: Напомняне), for the dashboard and the reminders alike: of `meals`, the dinners
 * of {@link thawDates} with a recipe that has products „Във фризера“ (`frozen` ingredient ids). Answered „Извадих“
 * or not.
 */
export function thawCandidates(
  meals: ReminderMeal[],
  frozen: Iterable<string>,
  now: Date,
): ThawCandidate[] {
  const dates = new Set(thawDates(now));
  const frozenIds = new Set(frozen);
  return meals.flatMap((meal) => {
    if (meal.title === null || !dates.has(meal.date)) {
      return [];
    }
    const products = meal.ingredients
      .filter((ingredient) => frozenIds.has(ingredient.id))
      .map((ingredient) => ingredient.name);
    return products.length === 0 ? [] : [{ meal, products }];
  });
}
