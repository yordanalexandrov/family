import { describe, expect, it } from 'vitest';
import {
  COOKING_ANSWER_MAX,
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

  it('asks the gateway for an object with the answer only', () => {
    expect(cookingAsk.responseFormat.schema).toMatchObject({
      type: 'object',
      required: ['answer'],
      additionalProperties: false,
    });
  });
});
