import { describe, expect, it } from 'vitest';
import fixture from './fixtures/recipe-suggest.valid.json' with {
  type: 'json',
};
import { type RecipeSuggestInput, recipeSuggest } from './recipe-suggest.js';

/** A hand-written, realistic answer of `family-recipe`; tests clone it before changing anything. */
function validOutput() {
  // biome-ignore lint/suspicious/noExplicitAny: tests break the fixture on purpose
  return JSON.parse(JSON.stringify(fixture)) as any;
}

const INPUT: RecipeSuggestInput = {
  slots: ['dinner'],
  existingRecipeTitles: [],
  ingredientNames: ['сол'],
};

/** What the OpenClaw client checks an answer with; `recipe.suggest` asks the same of every input. */
const outputSchema = recipeSuggest.outputSchema(INPUT);

function issuePaths(output: unknown): string[] {
  const result = outputSchema.safeParse(output);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('recipeSuggest.outputSchema', () => {
  it('accepts three normalized suggestions in Bulgarian', () => {
    const output = validOutput();

    expect(outputSchema.parse(output)).toEqual(output);
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

  it('accepts no suggestions with the reason in noResults', () => {
    const output = {
      suggestions: [],
      noResults:
        'Не намерих рецепти с риба за закуска в сайтовете, които отворих.',
    };

    expect(outputSchema.parse(output)).toEqual(output);
  });

  it('rejects suggestions together with noResults', () => {
    const output = validOutput();
    output.noResults = 'Няма достатъчно рецепти.';

    expect(issuePaths(output)).toEqual(['noResults']);
  });

  it('rejects no suggestions without noResults', () => {
    expect(issuePaths({ suggestions: [], noResults: null })).toEqual([
      'suggestions',
    ]);
  });

  it('rejects one or two suggestions, with or without noResults', () => {
    const output = validOutput();
    output.suggestions = output.suggestions.slice(0, 1);
    expect(issuePaths(output)).toEqual(['suggestions']);

    output.noResults = 'Намерих само една.';
    expect(issuePaths(output)).toEqual(['noResults']);
  });

  it('rejects a blank noResults', () => {
    expect(issuePaths({ suggestions: [], noResults: '  ' })).toEqual([
      'noResults',
    ]);
  });

  it('rejects two suggestions from the same page', () => {
    const output = validOutput();
    // Same page: other case of the host, `www.`, a trailing slash, query and fragment.
    output.suggestions[2].sourceUrl = `${output.suggestions[0].sourceUrl.replace(
      /^https:\/\/(?:www\.)?([^/]+)/,
      (_: string, host: string) => `https://www.${host.toUpperCase()}`,
    )}/?utm_source=x#steps`;

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
    output.suggestions[0].ingredients[1] = {
      ...output.suggestions[0].ingredients[1],
      unit: 'pinch',
      quantity: 1,
    };

    expect(issuePaths(output)).toEqual([
      'suggestions.0.ingredients.1.quantity',
    ]);
  });
});

describe('recipeSuggest.inputSchema', () => {
  const input = {
    slots: ['lunch', 'dinner'],
    times: ['0-15', '30-45'],
    tags: ['quick'],
    hint: 'нещо с риба',
    existingRecipeTitles: ['Леща яхния'],
    ingredientNames: ['леща', 'сьомга'],
  };

  it('accepts the client request together with the registry context added by the API', () => {
    expect(recipeSuggest.inputSchema.parse(input)).toEqual(input);
  });

  it('accepts a request with only one slot', () => {
    const minimal = {
      slots: ['lunch'],
      existingRecipeTitles: [],
      ingredientNames: [],
    };

    expect(recipeSuggest.inputSchema.parse(minimal)).toEqual(minimal);
  });

  it('rejects a hint longer than 200 characters', () => {
    expect(
      recipeSuggest.inputSchema.safeParse({ ...input, hint: 'р'.repeat(201) })
        .success,
    ).toBe(false);
  });

  it('rejects a slot that is not a meal (quick is a tag only)', () => {
    expect(
      recipeSuggest.inputSchema.safeParse({ ...input, slots: ['quick'] })
        .success,
    ).toBe(false);
  });

  it('rejects a request without a slot', () => {
    expect(
      recipeSuggest.inputSchema.safeParse({ ...input, slots: [] }).success,
    ).toBe(false);
  });

  it('rejects a time that is not one of the intervals', () => {
    expect(
      recipeSuggest.inputSchema.safeParse({ ...input, times: ['10-20'] })
        .success,
    ).toBe(false);
  });
});

describe('recipeSuggest.responseFormat', () => {
  it('is named recipe_suggest', () => {
    expect(recipeSuggest.responseFormat.name).toBe('recipe_suggest');
  });

  it('describes up to 5 suggestions with the required fields for response_format', () => {
    const schema = recipeSuggest.responseFormat.schema as unknown as {
      properties: {
        suggestions: {
          minItems: number;
          maxItems: number;
          items: { required: string[]; properties: Record<string, unknown> };
        };
      };
    };
    const suggestions = schema.properties.suggestions;

    // 0 for an answer with noResults; 3–5 otherwise is checked by the Zod contract.
    expect(suggestions.minItems).toBe(0);
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

    walk(recipeSuggest.responseFormat.schema, '$');

    expect(problems).toEqual([]);
  });

  it('asks for noResults as a string or null', () => {
    const schema = recipeSuggest.responseFormat.schema as unknown as {
      required: string[];
      properties: { noResults: unknown };
    };

    expect(schema.required).toContain('noResults');
    expect(schema.properties.noResults).toEqual({ type: ['string', 'null'] });
  });

  it('asks for nutritionPer100g as an object or null', () => {
    const schema = recipeSuggest.responseFormat.schema as unknown as {
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

describe('recipeSuggest.outputSchema under strict mode', () => {
  it('reads nutritionPer100g: null, as strict mode sends it, as no nutrition', () => {
    const output = validOutput();
    output.suggestions[0].nutritionPer100g = null;

    const parsed = outputSchema.parse(output);

    expect(parsed.suggestions[0]).not.toHaveProperty('nutritionPer100g');
    expect(parsed.suggestions[1]).toEqual(output.suggestions[1]);
  });

  it('still accepts nutrition left out and refuses what the contract refuses', () => {
    const output = validOutput();
    delete output.suggestions[0].nutritionPer100g;
    expect(outputSchema.parse(output)).toEqual(output);

    output.suggestions[1].sourceUrl = 'не е линк';
    expect(outputSchema.safeParse(output).success).toBe(false);
  });
});
