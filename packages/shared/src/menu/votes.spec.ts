import { describe, expect, it } from 'vitest';
import type { MealContent } from './meal.js';
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

const RISOTTO = '00000000-0000-4000-8000-0000000000a1';

/** A meal with a recipe unless `content` says otherwise (`{ recipeId: null, note: null }` is an empty day). */
function meal(
  date: string,
  mealVotes: Vote[],
  content: MealContent = {
    recipeId: RISOTTO,
    note: null,
  },
) {
  return { date, votes: mealVotes, ...content };
}

const EMPTY: MealContent = { recipeId: null, note: null };

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
    expect(mealOutcome(meal(TODAY, votes(dani, poli)), USERS)).toBe(outcome);
  });

  it('an empty day (no recipe, no note) has no outcome: it waits for a meal, not for a vote', () => {
    expect(mealOutcome(meal(TODAY, votes(), EMPTY), USERS)).toBeNull();
    expect(
      mealOutcome(meal(TODAY, votes('up', 'up'), EMPTY), USERS),
    ).toBeNull();
  });

  it('a note without a recipe is a meal: two up votes keep it', () => {
    expect(
      mealOutcome(
        meal(TODAY, votes('up', 'up'), { recipeId: null, note: 'навън' }),
        USERS,
      ),
    ).toBe('keep');
  });

  it('ignores the vote of someone who is not a user any more', () => {
    const stranger = '00000000-0000-4000-8000-000000000009';
    expect(
      mealOutcome(
        meal(TODAY, [
          ...votes('up', undefined),
          { userId: stranger, value: 'up' },
        ]),
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

  it('empty days from today on take no part: a week whose meals are all keep is agreed', () => {
    const meals = [
      meal(TODAY, votes('up', 'up')),
      meal('2026-11-05', votes(), EMPTY),
      meal('2026-11-06', votes(), EMPTY),
    ];
    expect(isAgreed(meals, USERS, TODAY)).toBe(true);
    expect(mealsToAgree(meals, USERS, TODAY)).toEqual([]);
  });

  it('empty days are not counted among the meals to agree', () => {
    const pending = meal('2026-11-05', votes('up'));
    const meals = [
      meal(TODAY, votes(), EMPTY),
      pending,
      meal('2026-11-06', votes(), EMPTY),
    ];
    expect(isAgreed(meals, USERS, TODAY)).toBe(false);
    expect(mealsToAgree(meals, USERS, TODAY)).toEqual([pending]);
  });

  it('an empty past day takes no part', () => {
    const meals = [
      meal('2026-11-03', votes(), EMPTY),
      meal(TODAY, votes('up', 'up')),
    ];
    expect(isAgreed(meals, USERS, TODAY)).toBe(true);
  });

  it('an empty plan has nothing to agree on', () => {
    expect(isAgreed([], USERS, TODAY)).toBe(true);
  });
});
