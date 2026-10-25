import { describe, expect, it } from 'vitest';
import fixture from './fixtures/recipe-suggest.valid.json' with {
  type: 'json',
};
import {
  RECIPE_SUGGEST_RESPONSE_JSON_SCHEMA,
  recipeSuggestInputSchema,
  recipeSuggestOutputSchema,
} from './recipe-suggest.js';

/** A hand-written, realistic answer of `family-recipe`; tests clone it before changing anything. */
function validOutput() {
  // biome-ignore lint/suspicious/noExplicitAny: tests break the fixture on purpose
  return JSON.parse(JSON.stringify(fixture)) as any;
}

function issuePaths(input: unknown): string[] {
  const result = recipeSuggestOutputSchema.safeParse(input);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('recipeSuggestOutputSchema', () => {
  it('accepts three normalized suggestions in Bulgarian', () => {
    const output = validOutput();

    expect(recipeSuggestOutputSchema.parse(output)).toEqual(output);
  });

  it('rejects only two suggestions', () => {
    const output = validOutput();
    output.suggestions = output.suggestions.slice(0, 2);

    expect(issuePaths(output)).toEqual(['suggestions']);
  });

  it('rejects six suggestions', () => {
    const output = validOutput();
    output.suggestions = [...output.suggestions, ...output.suggestions];

    expect(issuePaths(output)).toEqual(['suggestions']);
  });

  it('rejects a suggestion without a source URL', () => {
    const output = validOutput();
    delete output.suggestions[1].sourceUrl;

    expect(issuePaths(output)).toEqual(['suggestions.1.sourceUrl']);
  });

  it('rejects a source that is not a URL', () => {
    const output = validOutput();
    output.suggestions[0].sourceUrl = 'рецепта от баба';

    expect(issuePaths(output)).toEqual(['suggestions.0.sourceUrl']);
  });

  it('rejects a unit outside the fixed list', () => {
    const output = validOutput();
    output.suggestions[2].ingredients[0].unit = 'cup';

    expect(issuePaths(output)).toEqual(['suggestions.2.ingredients.0.unit']);
  });

  it('rejects a pinch with a quantity', () => {
    const output = validOutput();
    output.suggestions[0].ingredients[6].quantity = 1;

    expect(issuePaths(output)).toEqual([
      'suggestions.0.ingredients.6.quantity',
    ]);
  });
});

describe('recipeSuggestInputSchema', () => {
  const input = {
    slot: 'dinner',
    maxMinutes: 40,
    tags: ['quick'],
    hint: 'нещо с риба',
    existingRecipeTitles: ['Леща яхния'],
    ingredientNames: ['леща', 'сьомга'],
  };

  it('accepts the client request together with the registry context added by the API', () => {
    expect(recipeSuggestInputSchema.parse(input)).toEqual(input);
  });

  it('accepts a request with only the slot', () => {
    const minimal = {
      slot: 'lunch',
      existingRecipeTitles: [],
      ingredientNames: [],
    };

    expect(recipeSuggestInputSchema.parse(minimal)).toEqual(minimal);
  });

  it('rejects a hint longer than 200 characters', () => {
    expect(
      recipeSuggestInputSchema.safeParse({ ...input, hint: 'р'.repeat(201) })
        .success,
    ).toBe(false);
  });

  it('rejects a slot that is not a meal (quick is a tag only)', () => {
    expect(
      recipeSuggestInputSchema.safeParse({ ...input, slot: 'quick' }).success,
    ).toBe(false);
  });
});

describe('RECIPE_SUGGEST_RESPONSE_JSON_SCHEMA', () => {
  it('describes 3 to 5 suggestions with the required fields for response_format', () => {
    const schema = RECIPE_SUGGEST_RESPONSE_JSON_SCHEMA as unknown as {
      properties: {
        suggestions: {
          minItems: number;
          maxItems: number;
          items: { required: string[]; properties: Record<string, unknown> };
        };
      };
    };
    const suggestions = schema.properties.suggestions;

    expect(suggestions.minItems).toBe(3);
    expect(suggestions.maxItems).toBe(5);
    expect(suggestions.items.required).toEqual(
      expect.arrayContaining([
        'title',
        'sourceUrl',
        'why',
        'prepMinutes',
        'servings',
        'tags',
        'ingredients',
        'steps',
      ]),
    );
    expect(suggestions.items.required).not.toContain('nutritionPer100g');
  });
});
