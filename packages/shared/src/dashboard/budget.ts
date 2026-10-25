import type { BudgetSnapshot } from '../schemas/budget.js';
import { type DateKey, utcMidnightOf } from './time.js';

const DAY_MS = 86_400_000;

function dayNumber(key: DateKey): number {
  return utcMidnightOf(key) / DAY_MS;
}

/**
 * How much can be spent per day for the rest of the period: the remainder over the days from `today`
 * to `periodEnd`, both included. On the last day, or once the period is over, it is the whole remainder.
 */
export function dailyPace(snapshot: BudgetSnapshot, today: DateKey): number {
  const daysLeft = dayNumber(snapshot.periodEnd) - dayNumber(today) + 1;
  return daysLeft > 0 ? snapshot.remaining / daysLeft : snapshot.remaining;
}

/** More has been spent than the limit. */
export function isOverBudget(snapshot: BudgetSnapshot): boolean {
  return snapshot.remaining < 0;
}
