import { describe, expect, it } from 'vitest';
import inputFixture from './fixtures/menu-propose.input.json' with {
  type: 'json',
};
import fixture from './fixtures/menu-propose.valid.json' with { type: 'json' };
import { menuPropose } from './menu-propose.js';

/** No DOM or Node types in `shared`, so no `structuredClone`. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** A hand-written, realistic answer of `family-menu` for the input fixture; tests clone it before changing it. */
function validOutput() {
  // biome-ignore lint/suspicious/noExplicitAny: tests break the fixture on purpose
  return clone(fixture) as any;
}

function validInput() {
  return menuPropose.inputSchema.parse(clone(inputFixture));
}

/** What the OpenClaw client checks an answer to `input` with. */
function outputSchema(input = validInput()) {
  return menuPropose.outputSchema(input);
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

describe('menuPropose.outputSchema: shape', () => {
  it('accepts seven dinners with a why each and a summary, in Bulgarian', () => {
    const output = validOutput();

    expect(outputSchema().parse(output)).toEqual(output);
  });

  it('rejects six days', () => {
    const output = validOutput();
    output.days = output.days.slice(0, 6);

    expect(issuePaths(output)).toEqual(['days']);
  });

  it('rejects a day without why', () => {
    const output = validOutput();
    delete output.days[3].why;

    expect(issuePaths(output)).toEqual(['days.3.why']);
  });

  it('rejects a blank why', () => {
    const output = validOutput();
    output.days[3].why = '  ';

    expect(issuePaths(output)).toEqual(['days.3.why']);
  });

  it('rejects an answer without summary', () => {
    const output = validOutput();
    delete output.summary;

    expect(issuePaths(output)).toEqual(['summary']);
  });

  it('rejects a day that is not a date', () => {
    const output = validOutput();
    output.days[0].date = 'понеделник';

    expect(issuePaths(output)).toEqual(['days.0.date']);
  });
});

describe('menuPropose.inputSchema', () => {
  it('accepts the registry context the API assembles', () => {
    expect(menuPropose.inputSchema.parse(inputFixture)).toEqual(inputFixture);
  });

  it('accepts rated and served recipes and the use-up products of the pantry', () => {
    const input = menuPropose.inputSchema.parse(inputFixture);

    expect(input.recipes).toContainEqual(
      expect.objectContaining({ title: 'Леща яхния', rating: 5 }),
    );
    expect(input.recipes).toContainEqual(
      expect.objectContaining({
        title: 'Спагети болонезе',
        lastServedOn: '2026-10-26',
      }),
    );
    expect(input.useUp).toEqual([
      { name: 'спанак', note: 'фризер, ~400 г' },
      { name: 'тиквичка' },
    ]);
  });

  it('accepts an input without hint, ratings, served dates and use-up products', () => {
    const { hint: _hint, ...rest } = clone(inputFixture);
    const input = {
      ...rest,
      recipes: rest.recipes.map(
        ({ rating: _rating, lastServedOn: _served, ...recipe }) => recipe,
      ),
      useUp: [],
    };

    expect(menuPropose.inputSchema.parse(input)).toEqual(input);
  });

  it('rejects a rating outside 1 to 5', () => {
    const input = clone(inputFixture);
    input.recipes[0] = { ...input.recipes[0], rating: 6 } as never;

    expect(menuPropose.inputSchema.safeParse(input).success).toBe(false);
  });

  it('rejects a served date that is not a date', () => {
    const input = clone(inputFixture);
    input.recipes[0] = { ...input.recipes[0], lastServedOn: 'вчера' } as never;

    expect(menuPropose.inputSchema.safeParse(input).success).toBe(false);
  });

  it('no longer takes recentRecipeIds', () => {
    expect(
      menuPropose.inputSchema.safeParse({
        ...inputFixture,
        recentRecipeIds: [],
      }).success,
    ).toBe(false);
  });

  it('rejects a hint longer than 200 characters', () => {
    expect(
      menuPropose.inputSchema.safeParse({
        ...inputFixture,
        hint: 'р'.repeat(201),
      }).success,
    ).toBe(false);
  });

  it('rejects a week that does not start on Monday', () => {
    expect(
      menuPropose.inputSchema.safeParse({
        ...inputFixture,
        weekStart: '2026-11-03',
      }).success,
    ).toBe(false);
  });
});

describe('menuPropose.outputSchema: rules against the input', () => {
  it('finds nothing wrong with the fixture', () => {
    expect(problems(validOutput())).toEqual([]);
  });

  it('refuses a date outside the week and names the missing day', () => {
    const output = validOutput();
    output.days[6].date = '2026-11-09';

    expect(problems(output)).toEqual([
      expect.stringContaining('2026-11-09'),
      expect.stringContaining('2026-11-08'),
    ]);
  });

  it('refuses the same day twice', () => {
    const output = validOutput();
    output.days[1].date = '2026-11-02';

    expect(problems(output)).toEqual([
      expect.stringContaining('2026-11-02'),
      expect.stringContaining('2026-11-03'),
    ]);
  });

  it('refuses a recipe that is not in the input', () => {
    const output = validOutput();
    output.days[2].recipeId = 'b0000000-0000-4000-8000-000000000099';

    expect(problems(output)).toEqual([
      expect.stringContaining('b0000000-0000-4000-8000-000000000099'),
    ]);
  });

  it('refuses the same recipe twice in the week', () => {
    const output = validOutput();
    output.days[4].recipeId = output.days[0].recipeId;

    expect(problems(output)).toEqual([
      expect.stringContaining(output.days[0].recipeId),
    ]);
  });

  it('refuses a slot that was not asked for', () => {
    const output = validOutput();
    output.days[5].slot = 'lunch';

    expect(problems(output)).toContainEqual(expect.stringContaining('lunch'));
  });

  it('allows a recently served recipe: avoiding it is a preference, not a rule', () => {
    const input = validInput();
    const output = validOutput();
    // Served last week, the Monday before the proposed one.
    const served = input.recipes.find(
      (recipe) => recipe.lastServedOn === '2026-10-26',
    );
    expect(served).toBeDefined();
    output.days[4].recipeId = served?.id;

    expect(problems(output, input)).toEqual([]);
  });
});

describe('menuPropose.responseFormat', () => {
  it('is named menu_propose', () => {
    expect(menuPropose.responseFormat.name).toBe('menu_propose');
  });

  const schema = menuPropose.responseFormat.schema as unknown as {
    required: string[];
    properties: {
      days: {
        minItems: number;
        maxItems: number;
        items: { required: string[] };
      };
    };
  };

  it('describes exactly 7 days and a summary', () => {
    expect(schema.required).toEqual(['days', 'summary']);
    expect(schema.properties.days.minItems).toBe(7);
    expect(schema.properties.days.maxItems).toBe(7);
    expect(schema.properties.days.items.required).toEqual([
      'date',
      'slot',
      'recipeId',
      'why',
    ]);
  });

  it('is accepted by strict structured outputs: every object closed, every property required', () => {
    const found: string[] = [];
    function walk(node: unknown, path: string): void {
      if (typeof node !== 'object' || node === null) {
        return;
      }
      const record = node as Record<string, unknown>;
      if (record.type === 'object') {
        const keys = Object.keys(record.properties ?? {}).sort();
        const required = [...((record.required ?? []) as string[])].sort();
        if (record.additionalProperties !== false) {
          found.push(`${path}: additionalProperties is not false`);
        }
        if (JSON.stringify(required) !== JSON.stringify(keys)) {
          found.push(`${path}: not every property is required`);
        }
      }
      for (const [key, value] of Object.entries(record)) {
        walk(value, `${path}.${key}`);
      }
    }

    walk(menuPropose.responseFormat.schema, '$');

    expect(found).toEqual([]);
  });
});
