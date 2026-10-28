import { describe, expect, it } from 'vitest';
import fixtureInput from './fixtures/recipe-normalize.input.json' with {
  type: 'json',
};
import fixture from './fixtures/recipe-normalize.valid.json' with {
  type: 'json',
};
import {
  type RecipeNormalizeInput,
  recipeImportParamsSchema,
  recipeNormalize,
} from './recipe-normalize.js';

/** A hand-written, realistic answer of `family-import` to the input fixture; tests clone it before changing anything. */
function validOutput() {
  // biome-ignore lint/suspicious/noExplicitAny: tests break the fixture on purpose
  return JSON.parse(JSON.stringify(fixture)) as any;
}

const INPUT = recipeNormalize.inputSchema.parse(fixtureInput);
const outputSchema = recipeNormalize.outputSchema(INPUT);

const CHICKEN = 'e0000000-0000-4000-8000-000000000001';
const FOREIGN = 'f0000000-0000-4000-8000-000000000099';

function issuePaths(output: unknown, schema = outputSchema): string[] {
  const result = schema.safeParse(output);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('recipeNormalize.inputSchema', () => {
  it('accepts pasted text with an optional source link and the whole registry', () => {
    const input: RecipeNormalizeInput = {
      source: { kind: 'text', text: 'Палачинки: брашно, мляко, яйца.' },
      ingredients: [{ id: CHICKEN, name: 'пилешко филе', unit: 'g' }],
    };

    expect(recipeNormalize.inputSchema.parse(input)).toEqual(input);
    expect(INPUT.source).toMatchObject({
      kind: 'text',
      url: 'https://blog.example/pile-s-oriz',
    });
  });

  it('accepts a page by its final URL with the JSON-LD recipe, the page text, or both', () => {
    const ingredients = [
      { id: CHICKEN, name: 'пилешко филе', unit: 'g' as const },
    ];
    for (const source of [
      {
        kind: 'page' as const,
        url: 'https://cafedelites.com/chicken-tikka',
        jsonLd: { '@type': 'Recipe', name: 'Chicken Tikka' },
      },
      {
        kind: 'page' as const,
        url: 'https://gladni.com/2024/07/tavche.html',
        text: 'Продукти: боб',
      },
    ]) {
      expect(
        recipeNormalize.inputSchema.parse({ source, ingredients }).source,
      ).toEqual(source);
    }
  });

  it('refuses a page with neither JSON-LD nor text', () => {
    expect(
      recipeNormalize.inputSchema.safeParse({
        source: { kind: 'page', url: 'https://example.com/r' },
        ingredients: [],
      }).success,
    ).toBe(false);
  });

  it('accepts a photo as a source of its own kind, the picture outside the JSON', () => {
    const input = { source: { kind: 'photo' }, ingredients: [] };

    expect(recipeNormalize.inputSchema.parse(input)).toEqual(input);
  });

  it('refuses an unknown kind of source', () => {
    expect(
      recipeNormalize.inputSchema.safeParse({
        source: { kind: 'video', url: 'https://example.com' },
        ingredients: [],
      }).success,
    ).toBe(false);
  });
});

describe('recipeNormalize.outputSchema', () => {
  it('accepts one normalized recipe whose lines are linked to the registry or propose a new product', () => {
    const parsed = outputSchema.parse(validOutput());

    expect(parsed.noResults).toBeNull();
    expect(parsed.recipe?.title).toBe('Пилешко филе с ориз на фурна');
    expect(parsed.recipe?.ingredients[0]).toEqual({
      ingredientId: CHICKEN,
      newProduct: null,
      quantity: 600,
      unit: 'g',
      note: 'пилешки гърди',
    });
    expect(parsed.recipe?.ingredients[3]?.newProduct).toEqual({
      name: 'сумак',
      unit: 'g',
      aisle: 'spices',
    });
  });

  it('reads nutritionPer100g: null from strict mode as no nutrition, and keeps a given one', () => {
    const output = validOutput();
    expect(outputSchema.parse(output).recipe).not.toHaveProperty(
      'nutritionPer100g',
    );

    output.recipe.nutritionPer100g = {
      kcal: 160,
      proteinG: 12,
      fatG: 5,
      carbsG: 17,
    };
    expect(outputSchema.parse(output).recipe?.nutritionPer100g).toEqual({
      kcal: 160,
      proteinG: 12,
      fatG: 5,
      carbsG: 17,
    });
  });

  it('accepts no recipe with the reason in noResults', () => {
    const output = {
      recipe: null,
      noResults: 'Текстът е статия за градинарство, не рецепта.',
    };

    expect(outputSchema.parse(output)).toEqual(output);
  });

  it('refuses an ingredientId that is not in the registry of the input', () => {
    const output = validOutput();
    output.recipe.ingredients[1].ingredientId = FOREIGN;

    expect(issuePaths(output)).toEqual(['recipe.ingredients.1.ingredientId']);
  });

  it('refuses a line with both ingredientId and newProduct, and one with neither', () => {
    const output = validOutput();
    output.recipe.ingredients[0].newProduct = {
      name: 'пилешко филе',
      unit: 'g',
      aisle: 'meat',
    };
    output.recipe.ingredients[2].ingredientId = null;

    expect(issuePaths(output)).toEqual([
      'recipe.ingredients.0',
      'recipe.ingredients.2',
    ]);
  });

  it('refuses a pinch with a quantity', () => {
    const output = validOutput();
    output.recipe.ingredients[4] = {
      ingredientId: 'e0000000-0000-4000-8000-000000000004',
      newProduct: null,
      quantity: 1,
      unit: 'pinch',
      note: null,
    };

    expect(issuePaths(output)).toEqual(['recipe.ingredients.4.quantity']);
  });

  it('refuses empty steps and no ingredients', () => {
    const output = validOutput();
    output.recipe.steps = [];
    output.recipe.ingredients = [];

    expect(issuePaths(output)).toEqual(['recipe.ingredients', 'recipe.steps']);
  });

  it('refuses a blank step', () => {
    const output = validOutput();
    output.recipe.steps[1] = '  ';

    expect(issuePaths(output)).toEqual(['recipe.steps.1']);
  });

  it('refuses a new product with a unit that is not a base unit or an unknown aisle', () => {
    const output = validOutput();
    output.recipe.ingredients[3].newProduct = {
      name: 'сумак',
      unit: 'tsp',
      aisle: 'подправки',
    };

    expect(issuePaths(output)).toEqual([
      'recipe.ingredients.3.newProduct.unit',
      'recipe.ingredients.3.newProduct.aisle',
    ]);
  });

  it('refuses servings below 1 and a tag outside the list', () => {
    const output = validOutput();
    output.recipe.servings = 0;
    output.recipe.tags = ['dinner', 'vegan'];

    expect(issuePaths(output)).toEqual(['recipe.servings', 'recipe.tags.1']);
  });

  it('refuses a recipe together with noResults, and neither', () => {
    const both = validOutput();
    both.noResults = 'Няма рецепта.';
    expect(issuePaths(both)).toEqual(['noResults']);

    expect(issuePaths({ recipe: null, noResults: null })).toEqual(['recipe']);
  });
});

describe('recipeNormalize.responseFormat', () => {
  it('is a strict JSON Schema: every object closed and every property required', () => {
    const { schema } = recipeNormalize.responseFormat;

    function check(node: unknown): void {
      if (Array.isArray(node)) {
        node.forEach(check);
        return;
      }
      if (typeof node !== 'object' || node === null) {
        return;
      }
      const record = node as Record<string, unknown>;
      if (record.type === 'object' && record.properties) {
        expect(record.additionalProperties).toBe(false);
        expect([...(record.required as string[])].sort()).toEqual(
          Object.keys(record.properties as object).sort(),
        );
      }
      Object.values(record).forEach(check);
    }

    check(schema);
    expect(recipeNormalize.responseFormat.name).toBe('recipe_normalize');
  });
});

describe('recipeImportParamsSchema', () => {
  it('accepts a link, with force to import it again', () => {
    expect(
      recipeImportParamsSchema.parse({
        kind: 'url',
        url: 'https://bonapeti.bg/recepti/tikvenik2/',
      }),
    ).toEqual({ kind: 'url', url: 'https://bonapeti.bg/recepti/tikvenik2/' });
    expect(
      recipeImportParamsSchema.parse({
        kind: 'url',
        url: 'https://bonapeti.bg/r',
        force: true,
      }),
    ).toEqual({ kind: 'url', url: 'https://bonapeti.bg/r', force: true });
  });

  it('refuses a link that is not http(s)', () => {
    for (const url of [
      'ftp://example.com/r',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'бла',
    ]) {
      expect(
        recipeImportParamsSchema.safeParse({ kind: 'url', url }).success,
        url,
      ).toBe(false);
    }
  });

  it('accepts pasted text with an optional link, trimmed', () => {
    expect(
      recipeImportParamsSchema.parse({
        kind: 'text',
        text: '  Палачинки  ',
        url: 'https://blog.example/palachinki',
      }),
    ).toEqual({
      kind: 'text',
      text: 'Палачинки',
      url: 'https://blog.example/palachinki',
    });
  });

  it('refuses empty text, text over 20 000 characters and a link that is not a URL', () => {
    expect(
      recipeImportParamsSchema.safeParse({ kind: 'text', text: '   ' }).success,
    ).toBe(false);
    expect(
      recipeImportParamsSchema.safeParse({
        kind: 'text',
        text: 'а'.repeat(20_001),
      }).success,
    ).toBe(false);
    expect(
      recipeImportParamsSchema.safeParse({
        kind: 'text',
        text: 'а'.repeat(20_000),
      }).success,
    ).toBe(true);
    expect(
      recipeImportParamsSchema.safeParse({
        kind: 'text',
        text: 'Палачинки',
        url: 'блог на баба',
      }).success,
    ).toBe(false);
  });
});
