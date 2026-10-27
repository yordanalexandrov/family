import { describe, expect, it } from 'vitest';
import { mealReplaceRequestSchema } from './meal-replacement.js';

const POLI = '22222222-2222-4222-8222-222222222222';
const MEAL = '55555555-5555-4555-8555-555555555555';
const RECIPE = '44444444-4444-4444-8444-444444444444';

describe('mealReplaceRequestSchema', () => {
  const pending = {
    id: '66666666-6666-4666-8666-666666666666',
    mealId: MEAL,
    status: 'pending',
    requestedBy: POLI,
    createdAt: '2026-10-25T18:00:00.000Z',
  };

  it('accepts a pending request', () => {
    expect(mealReplaceRequestSchema.parse(pending)).toEqual(pending);
  });

  it('accepts a done request with its candidates, as the sheet shows them', () => {
    const done = {
      ...pending,
      status: 'done',
      candidates: [
        {
          recipeId: RECIPE,
          why: 'Без месо, както искате.',
          title: 'Леща яхния',
          prepMinutes: 45,
        },
        {
          recipeId: '77777777-7777-4777-8777-777777777777',
          why: 'Бързо.',
          title: 'Зеленчуков гювеч',
        },
      ],
      finishedAt: '2026-10-25T18:00:40.000Z',
    };

    expect(mealReplaceRequestSchema.parse(done)).toEqual(done);
  });

  it('accepts a failed request with the failure code', () => {
    const failed = {
      ...pending,
      status: 'failed',
      error: 'timeout',
      finishedAt: '2026-10-25T18:03:00.000Z',
    };

    expect(mealReplaceRequestSchema.parse(failed)).toEqual(failed);
  });

  it('rejects more than 3 candidates', () => {
    const candidate = { recipeId: RECIPE, why: 'Защото.', title: 'Леща' };

    expect(
      mealReplaceRequestSchema.safeParse({
        ...pending,
        status: 'done',
        candidates: [candidate, candidate, candidate, candidate],
      }).success,
    ).toBe(false);
  });
});
