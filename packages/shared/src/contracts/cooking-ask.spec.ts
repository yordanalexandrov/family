import { describe, expect, it } from 'vitest';
import {
  COOKING_ANSWER_MAX,
  COOKING_HISTORY_MAX,
  COOKING_QUESTION_MAX,
  cookingAsk,
} from './cooking-ask.js';
import fixtureInput from './fixtures/cooking-ask.input.json' with {
  type: 'json',
};
import fixture from './fixtures/cooking-ask.valid.json' with { type: 'json' };

const INPUT = cookingAsk.inputSchema.parse(fixtureInput);
const outputSchema = cookingAsk.outputSchema(INPUT);

function messages(output: unknown): string[] {
  const result = outputSchema.safeParse(output);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.message);
}

describe('cookingAsk.inputSchema', () => {
  it('accepts the recipe by the shown servings, its current step, the appliances and the question', () => {
    expect(INPUT.recipe.shownServings).toBe(2);
    expect(INPUT.currentStep).toBe(3);
    expect(INPUT.recipe.steps[2]?.text).toMatch(/Настържи 2-та домата/);
    expect(INPUT.appliances).toHaveLength(1);
  });

  it(`accepts a question of ${COOKING_QUESTION_MAX} characters and refuses a longer or an empty one`, () => {
    const at = (question: string) =>
      cookingAsk.inputSchema.safeParse({ ...fixtureInput, question }).success;

    expect(at('а'.repeat(COOKING_QUESTION_MAX))).toBe(true);
    expect(at('а'.repeat(COOKING_QUESTION_MAX + 1))).toBe(false);
    expect(at('   ')).toBe(false);
  });

  it(`accepts up to ${COOKING_HISTORY_MAX} earlier questions of the chain with their answers`, () => {
    const withHistory = (count: number) =>
      cookingAsk.inputSchema.safeParse({
        ...fixtureInput,
        history: Array.from({ length: count }, (_, n) => ({
          question: `Въпрос ${n + 1}`,
          answer: `Отговор ${n + 1}`,
        })),
      }).success;

    expect(withHistory(COOKING_HISTORY_MAX)).toBe(true);
    expect(withHistory(COOKING_HISTORY_MAX + 1)).toBe(false);
  });

  it('reads the lines by their index, with the ones changed or removed by applied changes marked', () => {
    const lines = [
      { index: 0, name: 'пилешко филе', quantity: 300, unit: 'g' },
      {
        index: 1,
        name: 'консерва pulp',
        quantity: 200,
        unit: 'g',
        changed: true,
      },
      { index: 2, name: 'сол', quantity: null, unit: 'pinch', removed: true },
    ];
    const parse = (ingredients: unknown[]) =>
      cookingAsk.inputSchema.safeParse({
        ...fixtureInput,
        recipe: { ...fixtureInput.recipe, ingredients },
      }).success;

    expect(parse(lines)).toBe(true);
    expect(parse([lines[1], lines[0]])).toBe(false);
  });

  it('refuses a current step the recipe does not have', () => {
    expect(
      cookingAsk.inputSchema.safeParse({ ...fixtureInput, currentStep: 5 })
        .success,
    ).toBe(false);
    expect(
      cookingAsk.inputSchema.safeParse({ ...fixtureInput, currentStep: 0 })
        .success,
    ).toBe(false);
  });
});

describe('cookingAsk.outputSchema', () => {
  it('accepts the recorded answer', () => {
    expect(outputSchema.parse(fixture)).toEqual(fixture);
  });

  it('refuses an empty answer', () => {
    expect(messages({ answer: '  ' })).not.toEqual([]);
    expect(messages({})).not.toEqual([]);
  });

  it(`refuses an answer over ${COOKING_ANSWER_MAX} characters`, () => {
    expect(messages({ answer: 'а'.repeat(COOKING_ANSWER_MAX) })).toEqual([]);
    expect(
      messages({ answer: 'а'.repeat(COOKING_ANSWER_MAX + 1) }),
    ).not.toEqual([]);
  });

  it('asks the gateway for the answer and a change or null', () => {
    expect(cookingAsk.responseFormat.schema).toMatchObject({
      type: 'object',
      required: ['answer', 'change'],
      additionalProperties: false,
    });
  });
});

describe('cookingAsk.outputSchema: the change', () => {
  const PULP = {
    kind: 'replace',
    index: 1,
    ingredient: { name: 'консерва pulp', quantity: 200, unit: 'g' },
  };

  it('reads a null change as none', () => {
    expect(outputSchema.parse({ answer: 'Да.', change: null })).toEqual({
      answer: 'Да.',
    });
  });

  it('accepts a change of the lines of the input', () => {
    const output = { answer: 'Да.', change: { ingredients: [PULP] } };
    expect(outputSchema.parse(output)).toEqual(output);
  });

  it('refuses a line the input does not have', () => {
    const last = INPUT.recipe.ingredients.length - 1;
    const remove = (index: number) => ({
      answer: 'Да.',
      change: { ingredients: [{ kind: 'remove', index }] },
    });

    expect(messages(remove(last))).toEqual([]);
    expect(messages(remove(last + 1))).toEqual([
      `Ред ${last + 1} го няма в продуктите на рецептата.`,
    ]);
  });

  it('refuses two entries for one line and an empty change', () => {
    expect(
      messages({
        answer: 'Да.',
        change: { ingredients: [PULP, { kind: 'remove', index: 1 }] },
      }),
    ).not.toEqual([]);
    expect(
      messages({ answer: 'Да.', change: { ingredients: [] } }),
    ).not.toEqual([]);
  });

  it('refuses a unit outside the list', () => {
    expect(
      messages({
        answer: 'Да.',
        change: {
          ingredients: [
            { ...PULP, ingredient: { ...PULP.ingredient, unit: 'консерва' } },
          ],
        },
      }),
    ).not.toEqual([]);
  });
});
