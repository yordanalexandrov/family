import { describe, expect, it } from 'vitest';
import fixture from './fixtures/recipe-suggest.valid.json' with {
  type: 'json',
};
import {
  RECIPE_SUGGEST_RESPONSE_JSON_SCHEMA,
  recipeSuggestAgentOutputSchema,
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

  it('rejects two suggestions from the same page', () => {
    const output = validOutput();
    output.suggestions[2].sourceUrl = `${output.suggestions[0].sourceUrl.toUpperCase().replace('HTTPS://', 'https://www.')}/?utm_source=x#steps`;

    expect(issuePaths(output)).toEqual(['suggestions.2.sourceUrl']);
  });

  it('rejects more than two suggestions from the same site', () => {
    const output = validOutput();
    output.suggestions = output.suggestions.map(
      (suggestion: { sourceUrl: string }, index: number) => ({
        ...suggestion,
        sourceUrl: `https://www.edin-sait.example/recepta-${index}`,
      }),
    );

    expect(issuePaths(output)).toEqual(['suggestions.2.sourceUrl']);
  });

  it('accepts two suggestions from the same site', () => {
    const output = validOutput();
    output.suggestions[1].sourceUrl = output.suggestions[0].sourceUrl.replace(
      /[^/]+$/,
      'druga-recepta',
    );

    expect(issuePaths(output)).toEqual([]);
  });

  it('rejects a placeholder suggestion with one ingredient and one step', () => {
    const output = validOutput();
    output.suggestions[1].ingredients = output.suggestions[1].ingredients.slice(
      0,
      1,
    );
    output.suggestions[1].steps = [
      'Приготви пилето с ориз според указанията на източника.',
    ];

    expect(issuePaths(output)).toEqual([
      'suggestions.1.ingredients',
      'suggestions.1.steps',
    ]);
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
  });

  it('is accepted by strict structured outputs: every object closed, every property required', () => {
    // OpenAI-style `strict: true`: optional fields are nullable instead, and only these string formats exist.
    const formats = new Set([
      'date-time',
      'time',
      'date',
      'duration',
      'email',
      'hostname',
      'ipv4',
      'ipv6',
      'uuid',
    ]);
    const problems: string[] = [];
    function walk(node: unknown, path: string): void {
      if (Array.isArray(node)) {
        for (const [index, item] of node.entries()) {
          walk(item, `${path}[${index}]`);
        }
        return;
      }
      if (typeof node !== 'object' || node === null) {
        return;
      }
      const record = node as Record<string, unknown>;
      if (record.type === 'object') {
        const keys = Object.keys(
          (record.properties ?? {}) as Record<string, unknown>,
        ).sort();
        if (record.additionalProperties !== false) {
          problems.push(`${path}: additionalProperties is not false`);
        }
        if (
          JSON.stringify([...((record.required ?? []) as string[])].sort()) !==
          JSON.stringify(keys)
        ) {
          problems.push(`${path}: not every property is required`);
        }
      }
      if (typeof record.format === 'string' && !formats.has(record.format)) {
        problems.push(`${path}: format ${record.format} is not supported`);
      }
      for (const [key, value] of Object.entries(record)) {
        walk(value, `${path}.${key}`);
      }
    }

    walk(RECIPE_SUGGEST_RESPONSE_JSON_SCHEMA, '$');

    expect(problems).toEqual([]);
  });

  it('asks for nutritionPer100g as an object or null', () => {
    const schema = RECIPE_SUGGEST_RESPONSE_JSON_SCHEMA as unknown as {
      properties: {
        suggestions: {
          items: { properties: { nutritionPer100g: { anyOf: unknown[] } } };
        };
      };
    };

    expect(
      schema.properties.suggestions.items.properties.nutritionPer100g.anyOf,
    ).toEqual([expect.objectContaining({ type: 'object' }), { type: 'null' }]);
  });
});

describe('recipeSuggestAgentOutputSchema', () => {
  it('reads nutritionPer100g: null, as strict mode sends it, as no nutrition', () => {
    const output = validOutput();
    output.suggestions[0].nutritionPer100g = null;

    const parsed = recipeSuggestAgentOutputSchema.parse(output);

    expect(parsed.suggestions[0]).not.toHaveProperty('nutritionPer100g');
    expect(parsed.suggestions[1]).toEqual(output.suggestions[1]);
  });

  it('still accepts nutrition left out and refuses what the contract refuses', () => {
    const output = validOutput();
    delete output.suggestions[0].nutritionPer100g;
    expect(recipeSuggestAgentOutputSchema.parse(output)).toEqual(output);

    output.suggestions[1].sourceUrl = 'не е линк';
    expect(recipeSuggestAgentOutputSchema.safeParse(output).success).toBe(
      false,
    );
  });
});
