import { describe, expect, it } from 'vitest';
import {
  parseRefusal,
  type Refusal,
  refusalErrorOf,
  refusalSchema,
} from './refusal.js';

/** One body per sub-code, as the api's error handler answers it. */
const bodies: Refusal[] = [
  {
    error: 'not_found',
    code: 'no_plan',
    message: 'Няма меню за тази седмица',
  },
  {
    error: 'not_found',
    code: 'no_proposal',
    message: 'Няма предложение за меню за тази седмица',
  },
  {
    error: 'not_found',
    code: 'no_replacement',
    message: 'Никой не е търсил друго ястие',
  },
  {
    error: 'conflict',
    code: 'not_enough_recipes',
    message: 'За предложение трябват поне 7 вечерни рецепти',
    have: 4,
    need: 7,
  },
  {
    error: 'conflict',
    code: 'already_in_pantry',
    message: 'Продуктът вече е в килера',
  },
  {
    error: 'conflict',
    code: 'not_staple',
    message: 'Свършва само постоянен продукт',
  },
  {
    error: 'not_found',
    code: 'push_disabled',
    message: 'Известията не са включени на сървъра',
  },
  {
    error: 'conflict',
    code: 'cook_taken',
    message: 'Някой вече готви',
    cookUserId: '00000000-0000-4000-8000-000000000001',
  },
  {
    error: 'conflict',
    code: 'system_line',
    message: 'Системен ред не се трие',
  },
  {
    error: 'conflict',
    code: 'past_meal',
    message: 'Миналото ястие не се променя',
  },
];

describe('refusalSchema', () => {
  it.each(bodies.map((body) => [body.code, body]))(
    'parses a %s refusal with its details',
    (_code, body) => {
      expect(refusalSchema.parse(body)).toEqual(body);
    },
  );

  it('rejects an error without a sub-code', () => {
    expect(
      refusalSchema.safeParse({ error: 'not_found', message: 'Няма' }).success,
    ).toBe(false);
  });
});

describe('parseRefusal', () => {
  const notEnough = {
    error: 'conflict',
    code: 'not_enough_recipes',
    message: 'Малко рецепти',
    have: 2,
    need: 7,
  };

  it('gives the body of the asked sub-code with its details', () => {
    expect(parseRefusal('not_enough_recipes', notEnough)).toEqual(notEnough);
  });

  it('is null for another sub-code', () => {
    expect(parseRefusal('no_plan', notEnough)).toBeNull();
  });

  it('is null for the asked sub-code with wrong details', () => {
    expect(
      parseRefusal('not_enough_recipes', { ...notEnough, need: undefined }),
    ).toBeNull();
    expect(
      parseRefusal('cook_taken', {
        error: 'conflict',
        code: 'cook_taken',
        message: 'Някой вече готви',
        cookUserId: 'не е uuid',
      }),
    ).toBeNull();
  });

  it('is null for the sub-code under another error', () => {
    expect(
      parseRefusal('no_plan', {
        error: 'conflict',
        code: 'no_plan',
        message: 'Няма меню',
      }),
    ).toBeNull();
  });

  it('is null for a body that is not an object', () => {
    expect(parseRefusal('no_plan', undefined)).toBeNull();
  });
});

describe('refusalErrorOf', () => {
  it.each([
    ['no_plan', 'not_found'],
    ['no_proposal', 'not_found'],
    ['no_replacement', 'not_found'],
    ['push_disabled', 'not_found'],
    ['not_enough_recipes', 'conflict'],
    ['already_in_pantry', 'conflict'],
    ['not_staple', 'conflict'],
    ['cook_taken', 'conflict'],
    ['system_line', 'conflict'],
    ['past_meal', 'conflict'],
  ] as const)('answers %s with %s', (code, error) => {
    expect(refusalErrorOf(code)).toBe(error);
  });
});
