import { describe, expect, it } from 'vitest';
import type { Aisle } from '../food/aisles.js';
import type { Unit } from '../food/units.js';
import type { Meal, MealPlan } from '../schemas/menu.js';
import type { Recipe } from '../schemas/recipe.js';
import {
  type ShoppingItemRecord,
  shoppingListSchema,
} from '../schemas/shopping.js';
import { buildShoppingList, checkState, withCheck } from './build.js';

const DANI = '00000000-0000-4000-8000-000000000001';
const POLI = '00000000-0000-4000-8000-000000000002';
const WEEK = '2026-10-26';
const INSTANT = '2026-10-20T10:00:00.000Z';

const ONION = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'лук',
  unit: 'g',
  aisle: 'produce',
} as const;
const RICE = {
  id: '10000000-0000-4000-8000-000000000002',
  name: 'ориз',
  unit: 'g',
  aisle: 'grains',
} as const;
const SALT = {
  id: '10000000-0000-4000-8000-000000000003',
  name: 'сол',
  unit: 'g',
  aisle: 'spices',
} as const;
const MILK = {
  id: '10000000-0000-4000-8000-000000000004',
  name: 'прясно мляко',
  unit: 'ml',
  aisle: 'dairy',
} as const;
const EGG = {
  id: '10000000-0000-4000-8000-000000000005',
  name: 'яйце',
  unit: 'pcs',
  aisle: 'dairy',
} as const;
const BREAD = {
  id: '10000000-0000-4000-8000-000000000006',
  name: 'хляб',
  unit: 'pcs',
  aisle: 'bakery',
} as const;
type Ingredient = {
  id: string;
  name: string;
  unit: 'g' | 'ml' | 'pcs';
  aisle: Aisle;
};

let nextId = 0;
function uuid(prefix: string): string {
  nextId += 1;
  return `${prefix}0000000-0000-4000-8000-${String(nextId).padStart(12, '0')}`;
}

function recipe(
  title: string,
  servings: number,
  lines: [Ingredient, number | null, Unit][],
): Recipe {
  return {
    id: uuid('2'),
    title,
    servings,
    steps: ['готви'],
    tags: [],
    ingredients: lines.map(([ingredient, quantity, unit]) => ({
      ingredientId: ingredient.id,
      quantity,
      unit,
      ingredient: { ...ingredient },
    })),
    archivedAt: null,
    createdAt: INSTANT,
    updatedAt: INSTANT,
  };
}

function meal(
  date: string,
  of: Recipe | null,
  servings: Record<string, number> = { [DANI]: 1, [POLI]: 1 },
  note: string | null = null,
): Meal {
  return {
    id: uuid('3'),
    planId: PLAN_ID,
    date,
    slot: 'dinner',
    recipeId: of?.id ?? null,
    note,
    cookUserId: null,
    servings,
    why: null,
    recipe: of ? { title: of.title, archivedAt: null } : null,
  };
}

const PLAN_ID = '40000000-0000-4000-8000-000000000001';

function plan(meals: Meal[]): MealPlan {
  return {
    id: PLAN_ID,
    weekStart: WEEK,
    summary: null,
    meals,
    createdBy: DANI,
    createdAt: INSTANT,
    updatedAt: INSTANT,
  };
}

function build(
  meals: Meal[],
  recipes: Recipe[],
  items: ShoppingItemRecord[] = [],
) {
  return buildShoppingList({ plan: plan(meals), recipes, items });
}

/** Every visible row as `title quantity unit`, in display order. */
function lines(list: ReturnType<typeof buildShoppingList>): string[] {
  return list.aisles.flatMap(({ items }) =>
    items.map((item) => `${item.title} ${item.quantity} ${item.unit}`),
  );
}

describe('buildShoppingList', () => {
  it('scales a recipe for 4 down to the 2 servings of the meal', () => {
    const pilaf = recipe('Пилаф', 4, [[RICE, 400, 'g']]);

    const list = build([meal('2026-10-26', pilaf)], [pilaf]);

    expect(lines(list)).toEqual(['ориз 200 g']);
  });

  it('sums one ingredient in one unit across two recipes', () => {
    const pilaf = recipe('Пилаф', 2, [
      [RICE, 150, 'g'],
      [ONION, 100, 'g'],
    ]);
    const soup = recipe('Супа', 2, [[ONION, 50, 'g']]);

    const list = build(
      [meal('2026-10-26', pilaf), meal('2026-10-27', soup)],
      [pilaf, soup],
    );

    expect(lines(list)).toEqual(['лук 150 g', 'ориз 150 g']);
  });

  it('keeps an ingredient in grams and in pieces as two rows', () => {
    const soup = recipe('Супа', 2, [[ONION, 100, 'g']]);
    const stew = recipe('Яхния', 2, [[ONION, 2, 'pcs']]);

    const list = build(
      [meal('2026-10-26', soup), meal('2026-10-27', stew)],
      [soup, stew],
    );

    expect(lines(list)).toEqual(['лук 100 g', 'лук 2 pcs']);
    expect(list.aisles[0]?.items.map((item) => item.key)).toEqual([
      `${ONION.id}:g`,
      `${ONION.id}:pcs`,
    ]);
  });

  it('turns kg into g before summing', () => {
    const pilaf = recipe('Пилаф', 2, [[RICE, 0.5, 'kg']]);
    const risotto = recipe('Ризото', 2, [[RICE, 200, 'g']]);
    const pudding = recipe('Мляко с ориз', 2, [
      [MILK, 1, 'l'],
      [MILK, 250, 'ml'],
    ]);

    const list = build(
      [
        meal('2026-10-26', pilaf),
        meal('2026-10-27', risotto),
        meal('2026-10-28', pudding),
      ],
      [pilaf, risotto, pudding],
    );

    expect(lines(list)).toEqual(['прясно мляко 1250 ml', 'ориз 700 g']);
  });

  it.each([
    ['123 g up to 130 g', [RICE, 123, 'g'], 'ориз 130 g'],
    ['120 g stays 120 g', [RICE, 120, 'g'], 'ориз 120 g'],
    ['1001 ml up to 1010 ml', [MILK, 1001, 'ml'], 'прясно мляко 1010 ml'],
    ['1.2 pcs up to 2', [EGG, 1.2, 'pcs'], 'яйце 2 pcs'],
    ['0.5 tbsp up to 1', [SALT, 0.5, 'tbsp'], 'сол 1 tbsp'],
    ['1.5 tsp up to 2', [SALT, 1.5, 'tsp'], 'сол 2 tsp'],
  ] as const)('rounds the week total up: %s', (_, line, expected) => {
    const dish = recipe('Ястие', 2, [[...line]]);

    expect(lines(build([meal('2026-10-26', dish)], [dish]))).toEqual([
      expected,
    ]);
  });

  it('rounds the sum, not each meal (0.3 g three times is 10 g, not 30 g)', () => {
    const dish = recipe('Ястие', 2, [[SALT, 0.3, 'g']]);

    const list = build(
      [
        meal('2026-10-26', dish),
        meal('2026-10-27', dish),
        meal('2026-10-28', dish),
      ],
      [dish],
    );

    expect(lines(list)).toEqual(['сол 10 g']);
  });

  it('does not round a scaled amount that is already whole (3 × 0.1 kg is 300 g)', () => {
    const dish = recipe('Ястие', 2, [[RICE, 0.1, 'kg']]);

    const list = build(
      [
        meal('2026-10-26', dish),
        meal('2026-10-27', dish),
        meal('2026-10-28', dish),
      ],
      [dish],
    );

    expect(lines(list)).toEqual(['ориз 300 g']);
  });

  it('lists a pinch once for the week, without a quantity', () => {
    const soup = recipe('Супа', 2, [[SALT, null, 'pinch']]);
    const stew = recipe('Яхния', 4, [[SALT, null, 'pinch']]);

    const list = build(
      [meal('2026-10-26', soup), meal('2026-10-27', stew)],
      [soup, stew],
    );

    expect(lines(list)).toEqual(['сол null pinch']);
    expect(list.aisles[0]?.items[0]?.sources).toHaveLength(2);
  });

  it('takes nothing from a meal with a note and no recipe', () => {
    const list = build([meal('2026-10-26', null, undefined, 'ядем навън')], []);

    expect(list.aisles).toEqual([]);
    expect(list.total).toBe(0);
  });

  it('takes nothing from a meal with 0 servings', () => {
    const pilaf = recipe('Пилаф', 2, [[RICE, 200, 'g']]);

    const list = build(
      [meal('2026-10-26', pilaf, { [DANI]: 0, [POLI]: 0 })],
      [pilaf],
    );

    expect(list.aisles).toEqual([]);
  });

  it('names the meals an item comes from, by date', () => {
    const pilaf = recipe('Пилаф', 2, [[ONION, 100, 'g']]);
    const soup = recipe('Супа', 2, [[ONION, 50, 'g']]);
    const tuesday = meal('2026-10-27', soup);
    const monday = meal('2026-10-26', pilaf);

    const list = build([tuesday, monday], [pilaf, soup]);

    expect(list.aisles[0]?.items[0]?.sources).toEqual([
      { date: '2026-10-26', mealId: monday.id, recipeTitle: 'Пилаф' },
      { date: '2026-10-27', mealId: tuesday.id, recipeTitle: 'Супа' },
    ]);
  });

  it('names a meal once when its recipe lists the ingredient twice', () => {
    const pudding = recipe('Мляко с ориз', 2, [
      [MILK, 1, 'l'],
      [MILK, 250, 'ml'],
    ]);
    const monday = meal('2026-10-26', pudding);

    const list = build([monday], [pudding]);

    expect(list.aisles[0]?.items[0]?.sources).toEqual([
      { date: '2026-10-26', mealId: monday.id, recipeTitle: 'Мляко с ориз' },
    ]);
  });
});

const CHECKED_AT = '2026-10-27T17:30:00.000Z';

function record(
  itemKey: string,
  overlay: Partial<ShoppingItemRecord>,
): ShoppingItemRecord {
  return {
    itemKey,
    kind: 'computed',
    title: null,
    quantity: null,
    unit: null,
    aisle: null,
    hidden: false,
    checkedBy: null,
    checkedAt: null,
    ...overlay,
  };
}

function manual(
  id: string,
  line: Pick<ShoppingItemRecord, 'title'> & Partial<ShoppingItemRecord>,
): ShoppingItemRecord {
  return record(`manual:${id}`, { kind: 'manual', ...line });
}

const MANUAL_ID = '50000000-0000-4000-8000-000000000001';

describe('buildShoppingList overlay', () => {
  const dinner = recipe('Вечеря', 2, [
    [ONION, 100, 'g'],
    [RICE, 200, 'g'],
    [EGG, 2, 'pcs'],
    [BREAD, 1, 'pcs'],
  ]);
  const week = [meal('2026-10-26', dinner)];

  it('leaves an item without a record unchecked and visible', () => {
    const [item] = build(week, [dinner]).aisles[0]?.items ?? [];

    expect(item).toMatchObject({
      checkedBy: null,
      checkedAt: null,
      hidden: false,
    });
  });

  it('moves a hidden item out of its aisle into hidden', () => {
    const list = build(
      week,
      [dinner],
      [record(`${RICE.id}:g`, { hidden: true })],
    );

    expect(lines(list)).not.toContain('ориз 200 g');
    expect(list.hidden).toMatchObject([
      { key: `${RICE.id}:g`, title: 'ориз', quantity: 200, hidden: true },
    ]);
    expect(list.aisles.map(({ aisle }) => aisle)).not.toContain('grains');
  });

  it('marks a checked item with who and when and drops it to the end of its aisle', () => {
    const cheese = {
      id: '10000000-0000-4000-8000-000000000007',
      name: 'сирене',
      unit: 'g',
      aisle: 'dairy',
    } as const;
    const salad = recipe('Салата', 2, [
      [cheese, 200, 'g'],
      [EGG, 2, 'pcs'],
    ]);

    const list = build(
      [meal('2026-10-26', salad)],
      [salad],
      [record(`${cheese.id}:g`, { checkedBy: POLI, checkedAt: CHECKED_AT })],
    );

    expect(list.aisles).toMatchObject([
      {
        aisle: 'dairy',
        items: [
          { title: 'яйце', checkedBy: null },
          { title: 'сирене', checkedBy: POLI, checkedAt: CHECKED_AT },
        ],
      },
    ]);
  });

  it('puts a manual item without an aisle in other, with no sources', () => {
    const list = build(week, [dinner], [manual(MANUAL_ID, { title: 'кафе' })]);

    expect(list.aisles.at(-1)).toEqual({
      aisle: 'other',
      items: [
        {
          key: `manual:${MANUAL_ID}`,
          kind: 'manual',
          title: 'кафе',
          quantity: null,
          unit: null,
          aisle: 'other',
          checkedBy: null,
          checkedAt: null,
          hidden: false,
          sources: [],
        },
      ],
    });
  });

  it('keeps the quantity, unit and aisle of a manual item as written', () => {
    const list = build(
      [],
      [],
      [
        manual(MANUAL_ID, {
          title: 'брашно',
          quantity: 1,
          unit: 'kg',
          aisle: 'grains',
        }),
      ],
    );

    expect(lines(list)).toEqual(['брашно 1 kg']);
    expect(list.aisles[0]?.aisle).toBe('grains');
  });

  it('counts only the visible items in total and remaining', () => {
    const list = build(
      week,
      [dinner],
      [
        record(`${RICE.id}:g`, { hidden: true }),
        record(`${EGG.id}:pcs`, { checkedBy: DANI, checkedAt: CHECKED_AT }),
        manual(MANUAL_ID, { title: 'кафе' }),
      ],
    );

    // лук, яйце (checked), хляб, кафе; ориз is hidden.
    expect(list.total).toBe(4);
    expect(list.remaining).toBe(3);
  });

  it('orders the aisles in walking order and leaves out empty ones', () => {
    const list = build(week, [dinner], [manual(MANUAL_ID, { title: 'кафе' })]);

    expect(list.aisles.map(({ aisle }) => aisle)).toEqual([
      'produce',
      'bakery',
      'dairy',
      'grains',
      'other',
    ]);
  });

  it('ignores a record of an item the menu no longer has', () => {
    const list = build(
      week,
      [dinner],
      [record(`${MILK.id}:ml`, { checkedBy: DANI, checkedAt: CHECKED_AT })],
    );

    expect(list.total).toBe(4);
    expect(lines(list)).not.toContain(expect.stringContaining('мляко'));
  });

  it('gives the list the week of its plan', () => {
    expect(build(week, [dinner]).weekStart).toBe(WEEK);
  });

  it('builds a list that the API contract accepts', () => {
    const list = build(
      week,
      [dinner],
      [
        record(`${RICE.id}:g`, { hidden: true }),
        record(`${EGG.id}:pcs`, { checkedBy: DANI, checkedAt: CHECKED_AT }),
        manual(MANUAL_ID, { title: 'кафе' }),
      ],
    );

    expect(shoppingListSchema.parse(list)).toEqual(list);
  });
});

describe('withCheck', () => {
  const breakfast = recipe('Закуска', 2, [
    [MILK, 200, 'ml'],
    [EGG, 2, 'pcs'],
    [RICE, 100, 'g'],
  ]);
  const week = [meal('2026-10-26', breakfast)];
  const milkKey = `${MILK.id}:ml`;
  const riceKey = `${RICE.id}:g`;
  const milkChecked = record(milkKey, {
    checkedBy: DANI,
    checkedAt: CHECKED_AT,
  });
  const riceHidden = record(riceKey, { hidden: true });

  it.each([
    {
      name: 'a checked item drops to the end of its aisle',
      records: [],
      key: milkKey,
      check: { checkedBy: POLI, checkedAt: CHECKED_AT },
      dairy: ['яйце', 'прясно мляко'],
      remaining: 2,
    },
    {
      name: 'an unchecked item goes back to title order',
      records: [milkChecked],
      key: milkKey,
      check: { checkedBy: null, checkedAt: null },
      dairy: ['прясно мляко', 'яйце'],
      remaining: 3,
    },
    {
      name: 'a hidden item stays hidden and does not count',
      records: [riceHidden],
      key: riceKey,
      check: { checkedBy: POLI, checkedAt: CHECKED_AT },
      dairy: ['прясно мляко', 'яйце'],
      remaining: 2,
    },
    {
      name: 'an unknown key changes nothing',
      records: [milkChecked],
      key: `${BREAD.id}:pcs`,
      check: { checkedBy: POLI, checkedAt: CHECKED_AT },
      dairy: ['яйце', 'прясно мляко'],
      remaining: 2,
    },
  ])('$name', ({ records, key, check, dairy, remaining }) => {
    const before = build(week, [breakfast], records);

    const after = withCheck(before, key, check);

    expect(
      after.aisles
        .find(({ aisle }) => aisle === 'dairy')
        ?.items.map(({ title }) => title),
    ).toEqual(dairy);
    expect(after.remaining).toBe(remaining);
    expect(after.total).toBe(before.total);
    const item = [
      ...after.aisles.flatMap(({ items }) => items),
      ...after.hidden,
    ].find((row) => row.key === key);
    if (item) {
      expect(item).toMatchObject(check);
    }
  });
});

describe('checkState', () => {
  it.each([
    { checked: true, expected: { checkedBy: DANI, checkedAt: CHECKED_AT } },
    { checked: false, expected: { checkedBy: null, checkedAt: null } },
  ])('checked: $checked', ({ checked, expected }) => {
    expect(checkState(checked, DANI, CHECKED_AT)).toEqual(expected);
  });
});
