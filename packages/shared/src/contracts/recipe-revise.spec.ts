import { describe, expect, it } from 'vitest';
import fixtureInput from './fixtures/recipe-revise.input.json' with {
  type: 'json',
};
import fixture from './fixtures/recipe-revise.valid.json' with { type: 'json' };
import {
  RECIPE_REVISION_INSTRUCTION_MAX,
  recipeRevise,
} from './recipe-revise.js';

/** A hand-written, realistic answer of `family-revise` to the input fixture; tests clone it before changing anything. */
function validOutput() {
  // biome-ignore lint/suspicious/noExplicitAny: tests break the fixture on purpose
  return JSON.parse(JSON.stringify(fixture)) as any;
}

const INPUT = recipeRevise.inputSchema.parse(fixtureInput);
const outputSchema = recipeRevise.outputSchema(INPUT);
const KNOWN_ID = 'e0000000-0000-4000-8000-000000000101';

function messages(output: unknown, schema = outputSchema): string[] {
  const result = schema.safeParse(output);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.message);
}

describe('recipeRevise.inputSchema', () => {
  it('accepts the recipe as recipe.refine reads it, the instruction, the cooking changes and the registry', () => {
    expect(INPUT.recipe.steps[1]?.image).toBe('e1');
    expect(INPUT.instruction).toBe('картофите искат още 20 минути');
    expect(INPUT.cookingChanges).toEqual([]);
    expect(INPUT.ingredients).toHaveLength(11);
  });

  it('accepts the cooking changes as readable lines', () => {
    const cookingChanges = ['вместо домат: консерва pulp 400 g'];

    expect(
      recipeRevise.inputSchema.parse({ ...INPUT, cookingChanges })
        .cookingChanges,
    ).toEqual(cookingChanges);
  });

  it(`takes an instruction of 1 to ${RECIPE_REVISION_INSTRUCTION_MAX} characters`, () => {
    const at = (instruction: string) =>
      recipeRevise.inputSchema.safeParse({ ...INPUT, instruction }).success;

    expect(at('а'.repeat(RECIPE_REVISION_INSTRUCTION_MAX))).toBe(true);
    expect(at('а'.repeat(RECIPE_REVISION_INSTRUCTION_MAX + 1))).toBe(false);
    expect(at('  ')).toBe(false);
  });
});

describe('recipeRevise.outputSchema', () => {
  it('accepts the recorded answer, a missing note, rack or time before read as none', () => {
    const parsed = outputSchema.parse(validOutput());

    expect(parsed.recipe?.prepMinutes).toBe(110);
    expect(parsed.recipe?.ingredients[0]).toEqual({
      ingredientId: KNOWN_ID,
      newProduct: null,
      quantity: 1,
      unit: 'kg',
      note: null,
    });
    expect(parsed.recipe?.preparation).toEqual([
      { kind: 'oven', degrees: 200, fan: 'fan' },
    ]);
  });

  it('accepts no revision with the reason', () => {
    const output = {
      recipe: null,
      noResults: 'Указанието не е за тази рецепта.',
    };

    expect(outputSchema.parse(output)).toEqual(output);
  });

  it('refuses both a revision and a reason, or neither', () => {
    expect(
      messages({ ...validOutput(), noResults: 'Няма какво.' }),
    ).not.toEqual([]);
    expect(messages({ recipe: null, noResults: null })).not.toEqual([]);
  });

  it('accepts a line with a new product the registry lacks', () => {
    const output = validOutput();
    output.recipe.ingredients[0] = {
      ingredientId: null,
      newProduct: { name: 'бешамел', unit: 'g', aisle: 'spices' },
      quantity: 200,
      unit: 'g',
      note: null,
    };

    expect(messages(output)).toEqual([]);
  });

  it('refuses a line with both a registry product and a new one, or with neither', () => {
    const both = validOutput();
    both.recipe.ingredients[0] = {
      ingredientId: KNOWN_ID,
      newProduct: { name: 'картоф', unit: 'g', aisle: 'produce' },
      quantity: 1,
      unit: 'kg',
      note: null,
    };
    const neither = validOutput();
    neither.recipe.ingredients[0] = {
      ingredientId: null,
      newProduct: null,
      quantity: 1,
      unit: 'kg',
      note: null,
    };

    expect(messages(both)).not.toEqual([]);
    expect(messages(neither)).not.toEqual([]);
  });

  it('refuses a product that is not in the registry of the input', () => {
    const output = validOutput();
    output.recipe.ingredients[0] = {
      ingredientId: 'e0000000-0000-4000-8000-000000000999',
      newProduct: null,
      quantity: 1,
      unit: 'kg',
      note: null,
    };

    expect(messages(output)).toEqual([
      expect.stringContaining('e0000000-0000-4000-8000-000000000999'),
    ]);
  });

  it('refuses a quantity on „по вкус“', () => {
    const output = validOutput();
    output.recipe.ingredients[0] = {
      ingredientId: KNOWN_ID,
      newProduct: null,
      quantity: 5,
      unit: 'pinch',
      note: null,
    };

    expect(messages(output)).not.toEqual([]);
  });

  it('refuses a revision without steps', () => {
    const output = validOutput();
    output.recipe.steps = [];

    expect(messages(output)).not.toEqual([]);
  });

  it('refuses a photo the input does not have', () => {
    const output = validOutput();
    output.recipe.steps[0] = { text: 'Обели картофите.', image: 'e9' };

    expect(messages(output)).toEqual([expect.stringContaining('e9')]);
  });

  it('refuses a photo on two steps', () => {
    const output = validOutput();
    output.recipe.steps[0] = { text: 'Обели картофите.', image: 'e1' };
    output.recipe.steps[1] = { text: 'Запържи каймата.', image: 'e1' };

    expect(messages(output)).toEqual([expect.stringContaining('e1')]);
  });

  it('lets a photo of the recipe go with the step it was on', () => {
    const output = validOutput();
    output.recipe.steps = [{ text: 'Сготви мусаката.', image: null }];

    expect(messages(output)).toEqual([]);
  });

  it('refuses a preparation with two ovens', () => {
    const output = validOutput();
    output.recipe.preparation = [
      { kind: 'oven', degrees: 200, fan: 'fan', rack: null },
      { kind: 'oven', degrees: 180, fan: 'conventional', rack: null },
    ];

    expect(messages(output)).not.toEqual([]);
  });
});

describe('recipeRevise.responseFormat', () => {
  it('is a strict JSON Schema: every object closed, every property required, no oneOf', () => {
    const { schema } = recipeRevise.responseFormat;

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
    expect(JSON.stringify(schema)).toContain('"newProduct"');
  });
});
