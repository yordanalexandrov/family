import { describe, expect, it } from 'vitest';
import fixtureInput from './fixtures/recipe-refine.input.json' with {
  type: 'json',
};
import fixture from './fixtures/recipe-refine.valid.json' with { type: 'json' };
import { type RecipeRefineInput, recipeRefine } from './recipe-refine.js';

/** A hand-written, realistic answer of `family-refine` to the input fixture; tests clone it before changing anything. */
function validOutput() {
  // biome-ignore lint/suspicious/noExplicitAny: tests break the fixture on purpose
  return JSON.parse(JSON.stringify(fixture)) as any;
}

const INPUT = recipeRefine.inputSchema.parse(fixtureInput);
const outputSchema = recipeRefine.outputSchema(INPUT);

function messages(output: unknown, schema = outputSchema): string[] {
  const result = schema.safeParse(output);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.message);
}

describe('recipeRefine.inputSchema', () => {
  it('accepts a recipe with its photos as references and the page of its source', () => {
    expect(INPUT.recipe.steps[1]?.image).toBe('e1');
    expect(INPUT.source?.photos).toEqual(['s1', 's2', 's3']);
  });

  it('accepts a recipe without a source (typed in, or its page did not open)', () => {
    const input: RecipeRefineInput = { ...INPUT, source: null };

    expect(recipeRefine.inputSchema.parse(input)).toEqual(input);
  });

  it('refuses a page without JSON-LD and without text', () => {
    const result = recipeRefine.inputSchema.safeParse({
      ...INPUT,
      source: { url: 'https://blog.example/x', photos: [] },
    });

    expect(result.success).toBe(false);
  });
});

describe('recipeRefine.outputSchema', () => {
  it('accepts the recorded answer', () => {
    expect(outputSchema.parse(validOutput())).toEqual(validOutput());
  });

  it('accepts no refinement with the reason', () => {
    const output = {
      recipe: null,
      noResults: 'Стъпките вече са подробни.',
    };

    expect(outputSchema.parse(output)).toEqual(output);
  });

  it('refuses both a refinement and a reason, or neither', () => {
    expect(
      messages({ ...validOutput(), noResults: 'Няма какво.' }),
    ).not.toEqual([]);
    expect(messages({ recipe: null, noResults: null })).not.toEqual([]);
  });

  it('refuses an answer that loses a photo the recipe has', () => {
    const output = validOutput();
    output.recipe.steps[2].image = null;

    expect(messages(output)).toEqual([expect.stringContaining('e1')]);
  });

  it('refuses an answer that puts a photo on two steps', () => {
    const output = validOutput();
    output.recipe.steps[0].image = 'e1';

    expect(messages(output)).toEqual([expect.stringContaining('e1')]);

    const twice = validOutput();
    twice.recipe.steps[0].image = 's1';
    expect(messages(twice)).toEqual([expect.stringContaining('s1')]);
  });

  it('refuses a reference the input does not have', () => {
    const output = validOutput();
    output.recipe.steps[0].image = 's9';

    expect(messages(output)).toEqual([expect.stringContaining('s9')]);
  });

  it('refuses a photo of the source when the input has no source', () => {
    const input = recipeRefine.inputSchema.parse({ ...INPUT, source: null });

    expect(messages(validOutput(), recipeRefine.outputSchema(input))).toEqual([
      expect.stringContaining('s1'),
      expect.stringContaining('s3'),
    ]);
  });

  it('keeps the time the recipe has, fills only a missing one', () => {
    const input = recipeRefine.inputSchema.parse({
      ...INPUT,
      recipe: { ...INPUT.recipe, prepMinutes: 60 },
    });
    const schema = recipeRefine.outputSchema(input);

    expect(messages(validOutput(), schema)).toEqual([
      expect.stringContaining('60'),
    ]);
    const kept = validOutput();
    kept.recipe.prepMinutes = 60;
    expect(messages(kept, schema)).toEqual([]);
  });

  it('refuses a refinement without steps', () => {
    const output = validOutput();
    output.recipe.steps = [];

    expect(messages(output)).not.toEqual([]);
  });
});
