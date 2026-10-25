import { describe, expect, it } from 'vitest';
import { budgetSnapshotSchema } from '../schemas/budget.js';
import { dailyPace, isOverBudget } from './budget.js';

const october = budgetSnapshotSchema.parse({
  walletBudgetId: 'budget-1',
  name: 'Семеен бюджет',
  periodStart: '2026-10-01',
  periodEnd: '2026-10-31',
  limit: 3000,
  spent: 1800,
  remaining: 1200,
  currency: 'EUR',
  syncedAt: '2026-10-25T09:00:00.000Z',
});

describe('dailyPace', () => {
  it('splits the remainder over the days left, today and the last day included', () => {
    // 25..31 October: 7 days.
    expect(dailyPace(october, '2026-10-25')).toBeCloseTo(1200 / 7);
  });

  it('on the last day of the month is the whole remainder', () => {
    expect(dailyPace(october, '2026-10-31')).toBe(1200);
  });

  it('after the period has ended is the whole remainder', () => {
    expect(dailyPace(october, '2026-11-01')).toBe(1200);
  });

  it('is negative when the budget is already overspent', () => {
    expect(
      dailyPace({ ...october, spent: 3100, remaining: -100 }, '2026-10-31'),
    ).toBe(-100);
  });
});

describe('isOverBudget', () => {
  it('is false while something remains, and at exactly zero', () => {
    expect(isOverBudget(october)).toBe(false);
    expect(isOverBudget({ ...october, spent: 3000, remaining: 0 })).toBe(false);
  });

  it('is true once the remainder is negative', () => {
    expect(isOverBudget({ ...october, spent: 3100, remaining: -100 })).toBe(
      true,
    );
  });
});
