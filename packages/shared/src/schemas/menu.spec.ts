import { describe, expect, it } from 'vitest';
import {
  createMealCommentSchema,
  createMenuProposalSchema,
  mealCommentSchema,
  mealPlanSchema,
  mealSchema,
  menuProposalRequestSchema,
  updateMealSchema,
} from './menu.js';

const DANI = '11111111-1111-4111-8111-111111111111';
const POLI = '22222222-2222-4222-8222-222222222222';
const PLAN = '33333333-3333-4333-8333-333333333333';
const RECIPE = '44444444-4444-4444-8444-444444444444';

const meal = {
  id: '55555555-5555-4555-8555-555555555555',
  planId: PLAN,
  date: '2026-10-26',
  slot: 'dinner',
  recipeId: RECIPE,
  note: null,
  cookUserId: DANI,
  servings: { [DANI]: 1, [POLI]: 2 },
  why: 'Бързо за понеделник, без месо след уикенда.',
  recipe: { title: 'Леща яхния', archivedAt: null },
  votes: [
    { userId: DANI, value: 'up' },
    { userId: POLI, value: 'down' },
  ],
  commentCount: 0,
};

const comment = {
  id: '66666666-6666-4666-8666-666666666666',
  mealId: meal.id,
  kind: 'comment',
  authorUserId: POLI,
  body: 'пак пиле?',
  createdAt: '2026-10-26T17:00:00.000Z',
};

describe('mealSchema', () => {
  it('accepts a meal with a recipe, a cook and servings per user', () => {
    expect(mealSchema.parse(meal)).toEqual(meal);
  });

  it('accepts an empty meal: no recipe, no note, no cook', () => {
    const empty = {
      ...meal,
      recipeId: null,
      cookUserId: null,
      why: null,
      recipe: null,
    };

    expect(mealSchema.parse(empty)).toEqual(empty);
  });

  it('accepts a note instead of a recipe and zero servings for someone who is away', () => {
    const out = {
      ...meal,
      recipeId: null,
      recipe: null,
      note: 'ядем навън',
      servings: { [DANI]: 1, [POLI]: 0 },
    };

    expect(mealSchema.parse(out)).toEqual(out);
  });

  it('rejects a note longer than 80 characters', () => {
    expect(
      mealSchema.safeParse({ ...meal, note: 'б'.repeat(81) }).success,
    ).toBe(false);
  });

  it('rejects negative or fractional servings', () => {
    expect(
      mealSchema.safeParse({ ...meal, servings: { [DANI]: -1 } }).success,
    ).toBe(false);
    expect(
      mealSchema.safeParse({ ...meal, servings: { [DANI]: 1.5 } }).success,
    ).toBe(false);
  });

  it('rejects servings keyed by something that is not a user id', () => {
    expect(
      mealSchema.safeParse({ ...meal, servings: { Дани: 1 } }).success,
    ).toBe(false);
  });

  it('rejects a vote that is neither up nor down', () => {
    expect(
      mealSchema.safeParse({
        ...meal,
        votes: [{ userId: DANI, value: 'maybe' }],
      }).success,
    ).toBe(false);
  });

  it('rejects a slot that is not a meal of the day', () => {
    expect(mealSchema.safeParse({ ...meal, slot: 'quick' }).success).toBe(
      false,
    );
  });
});

describe('mealCommentSchema', () => {
  it('accepts a comment and a system line', () => {
    const system = {
      ...comment,
      kind: 'system',
      body: 'смени „Мусака“ → „Пиле с ориз“',
    };

    expect(mealCommentSchema.parse(comment)).toEqual(comment);
    expect(mealCommentSchema.parse(system)).toEqual(system);
  });

  it('rejects a kind that is neither comment nor system', () => {
    expect(
      mealCommentSchema.safeParse({ ...comment, kind: 'vote' }).success,
    ).toBe(false);
  });

  it('is the last line of a meal, next to the number of lines', () => {
    const withThread = { ...meal, lastComment: comment, commentCount: 3 };

    expect(mealSchema.parse(withThread)).toEqual(withThread);
  });
});

describe('createMealCommentSchema', () => {
  it('trims the body', () => {
    expect(createMealCommentSchema.parse({ body: '  пак пиле?  ' })).toEqual({
      body: 'пак пиле?',
    });
  });

  it('rejects a blank body and one longer than 500 characters', () => {
    expect(createMealCommentSchema.safeParse({ body: '   ' }).success).toBe(
      false,
    );
    expect(
      createMealCommentSchema.safeParse({ body: 'б'.repeat(501) }).success,
    ).toBe(false);
    expect(
      createMealCommentSchema.safeParse({ body: 'б'.repeat(500) }).success,
    ).toBe(true);
  });
});

describe('mealPlanSchema', () => {
  const plan = {
    id: PLAN,
    weekStart: '2026-10-26',
    summary: 'Лека седмица с две рибни вечери.',
    meals: [meal],
    createdBy: DANI,
    createdAt: '2026-10-25T18:00:00.000Z',
    updatedAt: '2026-10-25T18:00:00.000Z',
  };

  it('accepts a plan with its meals', () => {
    expect(mealPlanSchema.parse(plan)).toEqual(plan);
  });

  it('accepts a plan started empty, without a summary', () => {
    expect(mealPlanSchema.parse({ ...plan, summary: null }).summary).toBeNull();
  });

  it('rejects a week that does not start on Monday', () => {
    expect(
      mealPlanSchema.safeParse({ ...plan, weekStart: '2026-10-27' }).success,
    ).toBe(false);
  });
});

describe('updateMealSchema', () => {
  it('accepts a change of only the cook', () => {
    expect(updateMealSchema.parse({ cookUserId: POLI })).toEqual({
      cookUserId: POLI,
    });
  });

  it('accepts clearing the recipe and setting a trimmed note', () => {
    expect(
      updateMealSchema.parse({ recipeId: null, note: '  остатъци  ' }),
    ).toEqual({ recipeId: null, note: 'остатъци' });
  });

  it('turns a blank note into no note', () => {
    expect(updateMealSchema.parse({ note: '   ' })).toEqual({ note: null });
  });

  it('accepts new servings', () => {
    expect(updateMealSchema.parse({ servings: { [DANI]: 3 } })).toEqual({
      servings: { [DANI]: 3 },
    });
  });

  it('takes why only together with a recipe: the why of a picked candidate', () => {
    expect(
      updateMealSchema.parse({ recipeId: RECIPE, why: 'Без месо.' }),
    ).toEqual({ recipeId: RECIPE, why: 'Без месо.' });
    expect(updateMealSchema.safeParse({ why: 'защото' }).success).toBe(false);
    expect(
      updateMealSchema.safeParse({ recipeId: null, why: 'защото' }).success,
    ).toBe(false);
  });

  it('rejects a note longer than 80 characters', () => {
    expect(updateMealSchema.safeParse({ note: 'б'.repeat(81) }).success).toBe(
      false,
    );
  });
});

describe('createMenuProposalSchema', () => {
  it('accepts a week with a hint', () => {
    expect(
      createMenuProposalSchema.parse({
        weekStart: '2026-11-02',
        hint: 'повече риба',
      }),
    ).toEqual({ weekStart: '2026-11-02', hint: 'повече риба' });
  });

  it('accepts a week without a hint', () => {
    expect(createMenuProposalSchema.parse({ weekStart: '2026-11-02' })).toEqual(
      { weekStart: '2026-11-02' },
    );
  });

  it('rejects a hint longer than 200 characters', () => {
    expect(
      createMenuProposalSchema.safeParse({
        weekStart: '2026-11-02',
        hint: 'р'.repeat(201),
      }).success,
    ).toBe(false);
  });

  it('rejects a week that does not start on Monday', () => {
    expect(
      createMenuProposalSchema.safeParse({ weekStart: '2026-11-01' }).success,
    ).toBe(false);
  });
});

describe('menuProposalRequestSchema', () => {
  const pending = {
    id: '66666666-6666-4666-8666-666666666666',
    weekStart: '2026-11-02',
    hint: 'повече риба',
    status: 'pending',
    requestedBy: POLI,
    createdAt: '2026-10-25T18:00:00.000Z',
  };

  it('accepts a pending proposal', () => {
    expect(menuProposalRequestSchema.parse(pending)).toEqual(pending);
  });

  it('accepts a done proposal with its plan', () => {
    const done = {
      ...pending,
      status: 'done',
      planId: PLAN,
      finishedAt: '2026-10-25T18:01:10.000Z',
    };

    expect(menuProposalRequestSchema.parse(done)).toEqual(done);
  });

  it('accepts a failed proposal with the failure code', () => {
    const failed = {
      ...pending,
      status: 'failed',
      error: 'invalid_output',
      finishedAt: '2026-10-25T18:01:10.000Z',
    };

    expect(menuProposalRequestSchema.parse(failed)).toEqual(failed);
  });

  it('rejects an unknown status', () => {
    expect(
      menuProposalRequestSchema.safeParse({ ...pending, status: 'draft' })
        .success,
    ).toBe(false);
  });
});
