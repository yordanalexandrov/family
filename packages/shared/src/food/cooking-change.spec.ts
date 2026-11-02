import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  applyCookingChanges,
  applyStepChanges,
  type CookingChange,
  type CookingLine,
  cookingChangeSchema,
  cookingServings,
  recipeCookingLines,
  scaleCookingLine,
  withoutCookingChange,
} from './cooking-change.js';

/** The fixture recipe of `cooking.ask`, for 4. */
const RECIPE = {
  servings: 4,
  ingredients: [
    { ingredient: { name: 'пилешко филе' }, quantity: 600, unit: 'g' as const },
    {
      ingredient: { name: 'домат' },
      quantity: 4,
      unit: 'pcs' as const,
      note: 'зрели',
    },
    { ingredient: { name: 'сол' }, quantity: null, unit: 'pinch' as const },
  ],
};

const LINES = recipeCookingLines(RECIPE);

/** A change asked about at `servings` on the screen, as the schema reads it (without steps: none). */
const at = (servings: number, change: z.input<typeof cookingChangeSchema>) => ({
  servings,
  change: cookingChangeSchema.parse(change),
});

const PULP: CookingChange = {
  steps: [],
  ingredients: [
    {
      kind: 'replace',
      index: 1,
      ingredient: { name: 'консерва pulp', quantity: 200, unit: 'g' },
    },
  ],
};

function issues(change: unknown): string[] {
  const result = cookingChangeSchema.safeParse(change);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.message);
}

describe('cookingChangeSchema', () => {
  it('accepts a replaced, a removed and an added line', () => {
    expect(
      issues({
        ingredients: [
          {
            kind: 'replace',
            index: 1,
            ingredient: { name: 'pulp', quantity: 200, unit: 'g' },
          },
          { kind: 'remove', index: 2 },
          {
            kind: 'add',
            ingredient: { name: 'захар', quantity: 1, unit: 'tsp' },
          },
        ],
      }),
    ).toEqual([]);
  });

  it('refuses an empty change', () => {
    expect(issues({ ingredients: [] })).not.toEqual([]);
  });

  it('refuses two entries for one line', () => {
    expect(
      issues({
        ingredients: [
          { kind: 'remove', index: 1 },
          {
            kind: 'replace',
            index: 1,
            ingredient: { name: 'pulp', quantity: 200, unit: 'g' },
          },
        ],
      }),
    ).toEqual(['Два записа за ред 1 на продуктите.']);
  });

  it('refuses a unit outside the list and an amount for a pinch', () => {
    expect(
      issues({
        ingredients: [
          {
            kind: 'add',
            ingredient: { name: 'захар', quantity: 1, unit: 'щипка' },
          },
        ],
      }),
    ).not.toEqual([]);
    expect(
      issues({
        ingredients: [
          {
            kind: 'add',
            ingredient: { name: 'захар', quantity: 1, unit: 'pinch' },
          },
        ],
      }),
    ).not.toEqual([]);
  });

  it('refuses a negative line and an empty name', () => {
    expect(
      issues({ ingredients: [{ kind: 'remove', index: -1 }] }),
    ).not.toEqual([]);
    expect(
      issues({
        ingredients: [
          { kind: 'add', ingredient: { name: ' ', quantity: 1, unit: 'g' } },
        ],
      }),
    ).not.toEqual([]);
  });
});

describe('cookingChangeSchema: the steps', () => {
  it('accepts a change of the steps only, and of the steps and the products together', () => {
    expect(
      issues({ steps: [{ number: 3, text: 'Отцеди консервата и я добави.' }] }),
    ).toEqual([]);
    expect(
      issues({
        ingredients: PULP.ingredients,
        steps: [{ number: 3, text: 'Отцеди консервата и я добави.' }],
      }),
    ).toEqual([]);
  });

  it('reads a change without steps (stored before them) as one with none', () => {
    expect(
      cookingChangeSchema.parse({ ingredients: PULP.ingredients }),
    ).toEqual({ ingredients: PULP.ingredients, steps: [] });
  });

  it('refuses a change with no products and no steps', () => {
    expect(issues({ ingredients: [], steps: [] })).not.toEqual([]);
    expect(issues({})).not.toEqual([]);
  });

  it('refuses two entries for one step', () => {
    expect(
      issues({
        steps: [
          { number: 2, text: 'Едно.' },
          { number: 2, text: 'Друго.' },
        ],
      }),
    ).toEqual(['Два записа за стъпка 2.']);
  });

  it('refuses a step 0 and an empty text', () => {
    expect(issues({ steps: [{ number: 0, text: 'Едно.' }] })).not.toEqual([]);
    expect(issues({ steps: [{ number: 1, text: ' ' }] })).not.toEqual([]);
  });
});

describe('applyStepChanges', () => {
  const STEPS = [
    { text: 'Нарежи лука.' },
    { text: 'Настържи доматите и задуши 10 минути.', photoId: 'photo' },
    { text: 'Вари 20 минути.' },
  ];
  const DRAIN = {
    number: 2,
    text: 'Отцеди консервата и задуши 5 минути.',
  };
  const steps = (...entries: { number: number; text: string }[]) =>
    at(2, { ingredients: [], steps: entries });

  it('keeps the steps as they are without applied changes', () => {
    expect(applyStepChanges(STEPS, [])).toEqual(STEPS);
  });

  it('gives a step the new text, marked changed, with its photo and the same number of steps', () => {
    expect(applyStepChanges(STEPS, [steps(DRAIN)])).toEqual([
      STEPS[0],
      {
        text: 'Отцеди консервата и задуши 5 минути.',
        photoId: 'photo',
        changed: true,
      },
      STEPS[2],
    ]);
  });

  it('applies the changes in order: the last one for a step wins', () => {
    const later = { number: 2, text: 'Добави доматките цели.' };
    expect(applyStepChanges(STEPS, [steps(DRAIN), steps(later)])[1]).toEqual({
      text: 'Добави доматките цели.',
      photoId: 'photo',
      changed: true,
    });
  });

  it('reads the steps of a change of the steps and the products, and the products of it as before', () => {
    const both = at(2, { ingredients: PULP.ingredients, steps: [DRAIN] });

    expect(applyStepChanges(STEPS, [both])[1]?.text).toBe(DRAIN.text);
    expect(applyCookingChanges(LINES, [both])).toEqual(
      applyCookingChanges(LINES, [at(2, PULP)]),
    );
    expect(applyStepChanges(STEPS, [at(2, PULP)])).toEqual(STEPS);
  });

  it('passes over a step the recipe does not have (it lost steps since)', () => {
    expect(
      applyStepChanges(STEPS, [steps({ number: 4, text: 'Нова.' })]),
    ).toEqual(STEPS);
  });
});

describe('applyCookingChanges', () => {
  it('reads the recipe as lines for its own servings, unchanged', () => {
    expect(LINES).toEqual([
      { name: 'пилешко филе', quantity: 600, unit: 'g', servings: 4 },
      { name: 'домат', quantity: 4, unit: 'pcs', note: 'зрели', servings: 4 },
      { name: 'сол', quantity: null, unit: 'pinch', servings: 4 },
    ]);
    expect(applyCookingChanges(LINES, [])).toEqual(LINES);
  });

  it('replaces a line with the new product, for the servings it was asked at, marked changed', () => {
    const lines = applyCookingChanges(LINES, [at(2, PULP)]);

    expect(lines[1]).toEqual({
      name: 'консерва pulp',
      quantity: 200,
      unit: 'g',
      servings: 2,
      changed: true,
    });
    expect(lines).toHaveLength(3);
    expect(lines[0]).toEqual(LINES[0]);
  });

  it('keeps a removed line in its place, marked removed', () => {
    const lines = applyCookingChanges(LINES, [
      at(2, { ingredients: [{ kind: 'remove', index: 2 }] }),
    ]);

    expect(lines[2]).toEqual({ ...LINES[2], removed: true });
    expect(lines).toHaveLength(3);
  });

  it('adds a new line at the end, marked changed', () => {
    const lines = applyCookingChanges(LINES, [
      at(2, {
        ingredients: [
          {
            kind: 'add',
            ingredient: { name: 'захар', quantity: 1, unit: 'tsp' },
          },
        ],
      }),
    ]);

    expect(lines).toHaveLength(4);
    expect(lines[3]).toEqual({
      name: 'захар',
      quantity: 1,
      unit: 'tsp',
      servings: 2,
      changed: true,
    });
  });

  it('applies the changes in order: the last one for a line wins', () => {
    const removed = applyCookingChanges(LINES, [
      at(2, PULP),
      at(2, { ingredients: [{ kind: 'remove', index: 1 }] }),
    ]);
    expect(removed[1]).toMatchObject({ name: 'консерва pulp', removed: true });

    const replacedAgain = applyCookingChanges(LINES, [
      at(2, PULP),
      at(6, {
        ingredients: [
          {
            kind: 'replace',
            index: 1,
            ingredient: { name: 'цели доматки', quantity: 400, unit: 'g' },
          },
        ],
      }),
    ]);
    expect(replacedAgain[1]).toEqual({
      name: 'цели доматки',
      quantity: 400,
      unit: 'g',
      servings: 6,
      changed: true,
    });
  });

  it('brings a removed line back when a later change replaces it', () => {
    const lines = applyCookingChanges(LINES, [
      at(2, { ingredients: [{ kind: 'remove', index: 1 }] }),
      at(2, PULP),
    ]);

    expect(lines[1]).not.toHaveProperty('removed');
    expect(lines[1]).toMatchObject({ name: 'консерва pulp', changed: true });
  });

  it('passes over an entry for a line that is not there (an earlier change reverted)', () => {
    const lines = applyCookingChanges(LINES, [
      at(2, { ingredients: [{ kind: 'remove', index: 3 }] }),
    ]);

    expect(lines).toEqual(LINES);
  });
});

describe('withoutCookingChange', () => {
  const sugar = {
    id: 'sugar',
    ...at(4, {
      ingredients: [
        {
          kind: 'add',
          ingredient: { name: 'захар', quantity: 1, unit: 'tsp' },
        },
      ],
    }),
  };
  /** Asked with the sugar applied: its line (index 3) becomes honey. */
  const honey = {
    id: 'honey',
    ...at(4, {
      ingredients: [
        {
          kind: 'replace',
          index: 3,
          ingredient: { name: 'мед', quantity: 1, unit: 'tbsp' },
        },
      ],
    }),
  };
  const pulp = { id: 'pulp', ...at(4, PULP) };

  it('takes the change out and keeps the others in their order', () => {
    expect(
      withoutCookingChange(LINES, [pulp, sugar, honey], 'pulp').map(
        ({ id }) => id,
      ),
    ).toEqual(['sugar', 'honey']);
  });

  it('takes out with it a later change for a line only it had added', () => {
    expect(
      withoutCookingChange(LINES, [sugar, pulp, honey], 'sugar').map(
        ({ id }) => id,
      ),
    ).toEqual(['pulp']);
  });
});

describe('scaleCookingLine', () => {
  const pulp = applyCookingChanges(LINES, [at(2, PULP)]);
  const six = { recipe: 6, components: [] };

  it('scales a changed line from the servings it was asked at, the others from the recipe’s', () => {
    expect(scaleCookingLine(pulp[1] as CookingLine, six)).toEqual({
      quantity: 600,
      unit: 'g',
    });
    expect(scaleCookingLine(pulp[0] as CookingLine, six)).toEqual({
      quantity: 900,
      unit: 'g',
    });
    expect(scaleCookingLine(pulp[2] as CookingLine, six)).toEqual({
      quantity: null,
      unit: 'pinch',
    });
  });
});

/** Risotto for 1 with a pesto for 5 (GLOSSARY: Компонент): rice and stock are main lines, basil and oil the pesto’s. */
const RISOTTO = {
  servings: 1,
  components: [{ name: 'Песто', servings: 5 }],
  ingredients: [
    {
      ingredient: { name: 'ориз' },
      quantity: 80,
      unit: 'g' as const,
      component: null,
    },
    {
      ingredient: { name: 'босилек' },
      quantity: 50,
      unit: 'g' as const,
      component: 0,
    },
    {
      ingredient: { name: 'зехтин' },
      quantity: 100,
      unit: 'ml' as const,
      component: 0,
    },
  ],
};

const RISOTTO_LINES = recipeCookingLines(RISOTTO);

/** The amounts Готвене shows for the risotto at `shown` servings, with the pesto counter set by hand or not. */
function risottoAt(shown: number, manual?: readonly (number | null)[]) {
  const servings = cookingServings(RISOTTO, shown, manual);
  return RISOTTO_LINES.map((line) => scaleCookingLine(line, servings));
}

describe('cooking a recipe with a component', () => {
  it('makes one whole pesto for 1 risotto: the pesto counter is 5', () => {
    expect(cookingServings(RISOTTO, 1).components).toEqual([5]);
    expect(risottoAt(1)).toEqual([
      { quantity: 80, unit: 'g' },
      { quantity: 50, unit: 'g' },
      { quantity: 100, unit: 'ml' },
    ]);
  });

  it('still makes one pesto for 2 risotto, while the rice doubles', () => {
    expect(cookingServings(RISOTTO, 2).components).toEqual([5]);
    expect(risottoAt(2)).toEqual([
      { quantity: 160, unit: 'g' },
      { quantity: 50, unit: 'g' },
      { quantity: 100, unit: 'ml' },
    ]);
  });

  it('makes two whole pestos for 6 risotto: the counter is 10', () => {
    expect(cookingServings(RISOTTO, 6).components).toEqual([10]);
    expect(risottoAt(6)).toEqual([
      { quantity: 480, unit: 'g' },
      { quantity: 100, unit: 'g' },
      { quantity: 200, unit: 'ml' },
    ]);
  });

  it('scales the pesto by a counter set by hand, whatever the risotto servings', () => {
    expect(cookingServings(RISOTTO, 1, [7]).components).toEqual([7]);
    expect(risottoAt(1, [7])).toEqual([
      { quantity: 80, unit: 'g' },
      { quantity: 70, unit: 'g' },
      { quantity: 140, unit: 'ml' },
    ]);
  });

  it('leaves a recipe without components as it was', () => {
    const servings = cookingServings({ ...RECIPE, components: [] }, 6);
    expect(servings).toEqual({ recipe: 6, components: [] });
    expect(LINES.map((line) => scaleCookingLine(line, servings))).toEqual([
      { quantity: 900, unit: 'g' },
      { quantity: 6, unit: 'pcs' },
      { quantity: null, unit: 'pinch' },
    ]);
  });
});

describe('a cooking change to a component', () => {
  /** Walnuts instead of the basil: 40 g for the pesto counter it was asked at. */
  const WALNUTS = cookingChangeSchema.parse({
    ingredients: [
      {
        kind: 'replace',
        index: 1,
        ingredient: { name: 'орехи', quantity: 40, unit: 'g' },
      },
    ],
  });

  it('scales with the component’s counter it was asked at, not the risotto’s servings', () => {
    const lines = applyCookingChanges(RISOTTO_LINES, [
      { servings: 1, components: [10], change: WALNUTS },
    ]);
    // Asked with the pesto at 10, now at 5: half the walnuts, whatever the risotto.
    const servings = cookingServings(RISOTTO, 3, [5]);
    expect(scaleCookingLine(lines[1] as CookingLine, servings)).toEqual({
      quantity: 20,
      unit: 'g',
    });
    expect(lines[1]?.component).toEqual({ index: 0, servings: 5 });
  });

  it('without the counters it was asked at, takes the one Готвене starts with for its servings', () => {
    const lines = applyCookingChanges(RISOTTO_LINES, [
      { servings: 6, change: WALNUTS },
    ]);
    // Asked at 6 risotto: the pesto was at 10.
    expect(
      scaleCookingLine(lines[1] as CookingLine, cookingServings(RISOTTO, 1)),
    ).toEqual({ quantity: 20, unit: 'g' });
  });

  it('adds a new line to the main lines, scaled with the risotto', () => {
    const lines = applyCookingChanges(RISOTTO_LINES, [
      {
        servings: 1,
        components: [5],
        change: cookingChangeSchema.parse({
          ingredients: [
            {
              kind: 'add',
              ingredient: { name: 'пармезан', quantity: 20, unit: 'g' },
            },
          ],
        }),
      },
    ]);
    expect(lines[3]?.component).toBeUndefined();
    expect(
      scaleCookingLine(lines[3] as CookingLine, cookingServings(RISOTTO, 2)),
    ).toEqual({ quantity: 40, unit: 'g' });
  });
});
