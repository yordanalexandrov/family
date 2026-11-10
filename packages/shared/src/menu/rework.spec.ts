import { describe, expect, it } from 'vitest';
import type { MealContent } from './meal.js';
import { classifyRework, reworkCounts } from './rework.js';
import type { Vote } from './votes.js';

const DANI = '00000000-0000-4000-8000-000000000001';
const POLI = '00000000-0000-4000-8000-000000000002';
/** Wednesday of the week of 2 November 2026. */
const TODAY = '2026-11-04';
const RISOTTO = '00000000-0000-4000-8000-0000000000a1';

function votes(dani?: 'up' | 'down', poli?: 'up' | 'down'): Vote[] {
  return [
    ...(dani ? [{ userId: DANI, value: dani }] : []),
    ...(poli ? [{ userId: POLI, value: poli }] : []),
  ];
}

/** A dinner of `date` with a recipe unless `content` says otherwise. */
function meal(
  date: string,
  mealVotes: Vote[],
  content: MealContent = { recipeId: RISOTTO, note: null },
) {
  return { date, slot: 'dinner' as const, votes: mealVotes, ...content };
}

const NOTE_ONLY: MealContent = { recipeId: null, note: 'ядем навън' };
const EMPTY: MealContent = { recipeId: null, note: null };

function classifyOne(m: ReturnType<typeof meal>) {
  const [day] = classifyRework([m], TODAY);
  return day && { status: day.status, reason: day.reason };
}

describe('classifyRework', () => {
  it.each([
    ['one up and no down', votes('up'), { status: 'keep' }],
    ['both up', votes('up', 'up'), { status: 'keep' }],
    [
      'up and down (a veto)',
      votes('up', 'down'),
      { status: 'fill', reason: 'vetoed' },
    ],
    [
      'one down',
      votes(undefined, 'down'),
      { status: 'fill', reason: 'vetoed' },
    ],
    ['no votes', votes(), { status: 'fill', reason: 'unvoted' }],
  ])('a recipe with %s', (_, mealVotes, expected) => {
    expect(classifyOne(meal(TODAY, mealVotes))).toEqual({
      reason: undefined,
      ...expected,
    });
  });

  it('keeps a day with only a note, voted or not, unless someone voted down', () => {
    expect(classifyOne(meal('2026-11-05', votes(), NOTE_ONLY))).toEqual({
      status: 'keep',
      reason: undefined,
    });
    expect(classifyOne(meal('2026-11-05', votes('up'), NOTE_ONLY))).toEqual({
      status: 'keep',
      reason: undefined,
    });
    expect(
      classifyOne(meal('2026-11-05', votes('up', 'down'), NOTE_ONLY)),
    ).toEqual({ status: 'fill', reason: 'vetoed' });
  });

  it('fills an empty day', () => {
    expect(classifyOne(meal('2026-11-06', votes(), EMPTY))).toEqual({
      status: 'fill',
      reason: 'empty',
    });
  });

  it('leaves a day before today as past, whatever its votes, and treats today as to come', () => {
    expect(classifyOne(meal('2026-11-03', votes('down', 'down')))).toEqual({
      status: 'past',
      reason: undefined,
    });
    expect(classifyOne(meal('2026-11-03', votes(), EMPTY))).toEqual({
      status: 'past',
      reason: undefined,
    });
    expect(classifyOne(meal(TODAY, votes()))?.status).toBe('fill');
  });

  it('keeps the meal with each day, in the order given', () => {
    const meals = [
      meal('2026-11-03', votes()),
      meal(TODAY, votes('up')),
      meal('2026-11-05', votes(), EMPTY),
    ];

    expect(classifyRework(meals, TODAY).map((day) => day.meal)).toEqual(meals);
  });
});

describe('reworkCounts', () => {
  it('counts the kept, the replaced (vetoed or unvoted) and the filled (empty) days from today on', () => {
    const days = classifyRework(
      [
        meal('2026-11-03', votes()),
        meal(TODAY, votes('up')),
        meal('2026-11-05', votes(), NOTE_ONLY),
        meal('2026-11-06', votes('down')),
        meal('2026-11-07', votes()),
        meal('2026-11-08', votes(), EMPTY),
      ],
      TODAY,
    );

    expect(reworkCounts(days)).toEqual({ keep: 2, replace: 2, fill: 1 });
  });
});
