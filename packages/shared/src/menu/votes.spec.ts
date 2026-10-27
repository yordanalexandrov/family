import { describe, expect, it } from 'vitest';
import {
  isAgreed,
  isPastMeal,
  mealOutcome,
  mealsToAgree,
  type Vote,
} from './votes.js';

const DANI = '00000000-0000-4000-8000-000000000001';
const POLI = '00000000-0000-4000-8000-000000000002';
const USERS = [DANI, POLI];
const TODAY = '2026-11-04';

function votes(dani?: 'up' | 'down', poli?: 'up' | 'down'): Vote[] {
  return [
    ...(dani ? [{ userId: DANI, value: dani }] : []),
    ...(poli ? [{ userId: POLI, value: poli }] : []),
  ];
}

function meal(date: string, mealVotes: Vote[]) {
  return { date, votes: mealVotes };
}

describe('mealOutcome', () => {
  it.each([
    ['up', 'up', 'keep'],
    ['down', 'down', 'replace'],
    ['up', 'down', 'discuss'],
    ['down', 'up', 'discuss'],
    ['up', undefined, 'pending'],
    [undefined, 'down', 'pending'],
    [undefined, undefined, 'pending'],
  ] as const)('Дани %s, Поли %s → %s', (dani, poli, outcome) => {
    expect(mealOutcome(votes(dani, poli), USERS)).toBe(outcome);
  });

  it('ignores the vote of someone who is not a user any more', () => {
    const stranger = '00000000-0000-4000-8000-000000000009';
    expect(
      mealOutcome(
        [...votes('up', undefined), { userId: stranger, value: 'up' }],
        USERS,
      ),
    ).toBe('pending');
  });
});

describe('isPastMeal', () => {
  it('is a day before today, not today or later', () => {
    expect(isPastMeal({ date: '2026-11-03' }, TODAY)).toBe(true);
    expect(isPastMeal({ date: TODAY }, TODAY)).toBe(false);
    expect(isPastMeal({ date: '2026-11-05' }, TODAY)).toBe(false);
  });
});

describe('isAgreed and mealsToAgree', () => {
  it('a plan is agreed when every meal from today on is keep', () => {
    const meals = [
      meal(TODAY, votes('up', 'up')),
      meal('2026-11-05', votes('up', 'up')),
    ];
    expect(isAgreed(meals, USERS, TODAY)).toBe(true);
    expect(mealsToAgree(meals, USERS, TODAY)).toEqual([]);
  });

  it('past days take no part, whatever their votes', () => {
    const meals = [
      meal('2026-11-02', votes('down', 'down')),
      meal('2026-11-03', votes()),
      meal(TODAY, votes('up', 'up')),
    ];
    expect(isAgreed(meals, USERS, TODAY)).toBe(true);
  });

  it('one meal from today on that is not keep is still to agree', () => {
    const pending = meal('2026-11-06', votes('up'));
    const discuss = meal('2026-11-07', votes('up', 'down'));
    const meals = [meal(TODAY, votes('up', 'up')), pending, discuss];
    expect(isAgreed(meals, USERS, TODAY)).toBe(false);
    expect(mealsToAgree(meals, USERS, TODAY)).toEqual([pending, discuss]);
  });

  it('an empty plan has nothing to agree on', () => {
    expect(isAgreed([], USERS, TODAY)).toBe(true);
  });
});
