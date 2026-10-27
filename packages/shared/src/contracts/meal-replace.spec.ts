import { describe, expect, it } from 'vitest';
import inputFixture from './fixtures/meal-replace.input.json' with {
  type: 'json',
};
import fixture from './fixtures/meal-replace.valid.json' with { type: 'json' };
import { mealReplace } from './meal-replace.js';

/** No DOM or Node types in `shared`, so no `structuredClone`. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** A hand-written, realistic answer of `family-meal` for the input fixture; tests clone it before changing it. */
function validOutput() {
  // biome-ignore lint/suspicious/noExplicitAny: tests break the fixture on purpose
  return clone(fixture) as any;
}

function validInput() {
  return mealReplace.inputSchema.parse(clone(inputFixture));
}

/** What the OpenClaw client checks an answer to `input` with. */
function outputSchema(input = validInput()) {
  return mealReplace.outputSchema(input);
}

/** Where the answer's shape is wrong; the rules against the input report at the root and are left out here. */
function issuePaths(output: unknown): string[] {
  const result = outputSchema().safeParse(output);
  return result.success
    ? []
    : result.error.issues
        .map((issue) => issue.path.join('.'))
        .filter((path) => path !== '');
}

/** The rule problems of an answer that has the right shape, in Bulgarian, as the retry message carries them. */
function problems(output: unknown, input = validInput()): string[] {
  const result = outputSchema(input).safeParse(output);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.message);
}

describe('mealReplace.inputSchema', () => {
  it('accepts the meal, its thread, the rest of the week and the registry the API assembles', () => {
    expect(mealReplace.inputSchema.parse(inputFixture)).toEqual(inputFixture);
  });

  it('accepts an empty meal with an empty thread and no recent recipes', () => {
    const input = {
      ...clone(inputFixture),
      current: {},
      thread: [],
      recentRecipeIds: [],
    };

    expect(mealReplace.inputSchema.parse(input)).toEqual(input);
  });

  it('accepts a meal that has only a note', () => {
    const input = { ...clone(inputFixture), current: { note: 'ядем навън' } };

    expect(mealReplace.inputSchema.parse(input)).toEqual(input);
  });

  it('rejects a thread line of an unknown kind', () => {
    const input = clone(inputFixture);
    input.thread[0] = { ...input.thread[0], kind: 'vote' } as never;

    expect(mealReplace.inputSchema.safeParse(input).success).toBe(false);
  });
});

describe('mealReplace.outputSchema: shape', () => {
  it('accepts up to 3 candidates with a why each, in Bulgarian', () => {
    const output = validOutput();

    expect(outputSchema().parse(output)).toEqual(output);
  });

  it('accepts a single candidate', () => {
    const output = validOutput();
    output.candidates = output.candidates.slice(0, 1);

    expect(outputSchema().parse(output)).toEqual(output);
  });

  it('rejects no candidates', () => {
    const output = validOutput();
    output.candidates = [];

    expect(issuePaths(output)).toEqual(['candidates']);
  });

  it('rejects 4 candidates', () => {
    const output = validOutput();
    output.candidates.push({
      recipeId: 'a0000000-0000-4000-8000-000000000003',
      why: 'Още една риба.',
    });

    expect(issuePaths(output)).toEqual(['candidates']);
  });

  it('rejects a blank why', () => {
    const output = validOutput();
    output.candidates[1].why = '  ';

    expect(issuePaths(output)).toEqual(['candidates.1.why']);
  });

  it('rejects a candidate without why', () => {
    const output = validOutput();
    delete output.candidates[0].why;

    expect(issuePaths(output)).toEqual(['candidates.0.why']);
  });
});

describe('mealReplace.outputSchema: rules against the input', () => {
  it('finds nothing wrong with the fixture', () => {
    expect(problems(validOutput())).toEqual([]);
  });

  it('refuses a recipe that is not in the input', () => {
    const output = validOutput();
    output.candidates[2].recipeId = 'b0000000-0000-4000-8000-000000000099';

    expect(problems(output)).toEqual([
      expect.stringContaining('b0000000-0000-4000-8000-000000000099'),
    ]);
  });

  it('refuses the current recipe: it is not among the recipes to choose from', () => {
    const input = validInput();
    const output = validOutput();
    output.candidates[0].recipeId = input.current.recipeId;

    expect(problems(output, input)).toEqual([
      expect.stringContaining(input.current.recipeId ?? ''),
    ]);
  });

  it('refuses the same recipe twice', () => {
    const output = validOutput();
    output.candidates[2].recipeId = output.candidates[0].recipeId;

    expect(problems(output)).toEqual([
      expect.stringContaining(output.candidates[0].recipeId),
    ]);
  });

  it('allows a recent recipe: avoiding it is a preference, not a rule', () => {
    const input = validInput();
    const output = validOutput();
    output.candidates[0].recipeId = input.recentRecipeIds[0];

    expect(problems(output, input)).toEqual([]);
  });
});

describe('mealReplace.responseFormat', () => {
  it('is named meal_replace', () => {
    expect(mealReplace.responseFormat.name).toBe('meal_replace');
  });

  const schema = mealReplace.responseFormat.schema as unknown as {
    required: string[];
    additionalProperties: boolean;
    properties: {
      candidates: {
        minItems: number;
        maxItems: number;
        items: { required: string[]; additionalProperties: boolean };
      };
    };
  };

  it('describes 1 to 3 closed candidates with recipeId and why', () => {
    expect(schema.required).toEqual(['candidates']);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.candidates.minItems).toBe(1);
    expect(schema.properties.candidates.maxItems).toBe(3);
    expect(schema.properties.candidates.items.required).toEqual([
      'recipeId',
      'why',
    ]);
    expect(schema.properties.candidates.items.additionalProperties).toBe(false);
  });
});
