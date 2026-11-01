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

  it('accepts the preparation the recipe has, and none for an older one', () => {
    const preparation = [
      { kind: 'oven', degrees: 180, fan: 'conventional' },
      { kind: 'soak', text: 'накисни боба', minutesBefore: 480 },
    ] as const;

    expect(
      recipeRefine.inputSchema.parse({
        ...INPUT,
        recipe: { ...INPUT.recipe, preparation },
      }).recipe.preparation,
    ).toEqual(preparation);
    const { preparation: _, ...older } = INPUT.recipe;
    expect(
      recipeRefine.inputSchema.parse({ ...INPUT, recipe: older }).recipe
        .preparation,
    ).toEqual([]);
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

  it('reads a missing rack or time before as none', () => {
    const output = validOutput();
    output.recipe.preparation = [
      { kind: 'oven', degrees: 180, fan: 'conventional', rack: null },
      { kind: 'pan', text: 'тава 30×20 с хартия', minutesBefore: null },
    ];

    expect(outputSchema.parse(output).recipe?.preparation).toEqual([
      { kind: 'oven', degrees: 180, fan: 'conventional' },
      { kind: 'pan', text: 'тава 30×20 с хартия' },
    ]);
  });

  it('accepts a refinement without preparation', () => {
    const output = validOutput();
    output.recipe.preparation = [];

    expect(outputSchema.parse(output).recipe?.preparation).toEqual([]);
  });

  it('refuses a preparation the recipe cannot keep: two ovens, an oven without its fan, too long a text or time before, too many', () => {
    const oven = { kind: 'oven', degrees: 200, fan: 'fan', rack: null };
    const cases = [
      [oven, { ...oven, degrees: 180 }],
      [{ ...oven, fan: null }],
      [{ kind: 'other', text: 'х'.repeat(61), minutesBefore: null }],
      [{ kind: 'soak', text: 'накисни боба', minutesBefore: 3000 }],
      Array.from({ length: 9 }, () => ({
        kind: 'other',
        text: 'нещо',
        minutesBefore: null,
      })),
    ];
    for (const preparation of cases) {
      const output = validOutput();
      output.recipe.preparation = preparation;

      expect(messages(output)).not.toEqual([]);
    }
  });

  it('refuses a refinement without preparation in it', () => {
    const output = validOutput();
    delete output.recipe.preparation;

    expect(messages(output)).not.toEqual([]);
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

describe('recipeRefine.responseFormat', () => {
  it('is a strict JSON Schema: every object closed, every property required, no oneOf', () => {
    const { schema } = recipeRefine.responseFormat;

    function check(node: unknown): void {
      if (Array.isArray(node)) {
        node.forEach(check);
        return;
      }
      if (typeof node !== 'object' || node === null) {
        return;
      }
      const record = node as Record<string, unknown>;
      expect(record).not.toHaveProperty('oneOf');
      if (record.type === 'object' && record.properties) {
        expect(record.additionalProperties).toBe(false);
        expect([...(record.required as string[])].sort()).toEqual(
          Object.keys(record.properties as object).sort(),
        );
      }
      Object.values(record).forEach(check);
    }

    check(schema);
    expect(JSON.stringify(schema)).toContain('"preparation"');
  });
});
