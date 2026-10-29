import { readdir, readFile } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { shoppingItem, shoppingList } from '../db/schema/shopping.js';
import { buildTestApp } from '../test/app.js';
import { testDb } from '../test/db.js';
import { DANI, POLI } from '../test/users.js';

/** Wednesday 28 October 2026, 10:00 in Sofia. */
const NOW = new Date('2026-10-28T08:00:00Z');
const WEEK = '2026-11-02';

let clock = NOW;
let app: FastifyInstance;

beforeAll(async () => {
  app = buildTestApp({ now: () => clock });
  await app.ready();
});

beforeEach(() => {
  clock = NOW;
});

afterAll(() => app.close());

function inject(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
  actingUser = DANI.id,
) {
  return app.inject({
    method,
    url,
    headers: { 'x-acting-user': actingUser },
    payload,
  });
}

function getList(weekStart = WEEK) {
  return inject('GET', `/api/shopping-lists/${weekStart}`);
}

async function created(response: LightMyRequestResponse) {
  expect(response.statusCode).toBe(201);
  return response.json();
}

async function createIngredient(name: string, unit: string, aisle: string) {
  const body = await created(
    await inject('POST', '/api/ingredients', { name, unit, aisle }),
  );
  return body.ingredient.id as string;
}

async function createRecipe(
  title: string,
  ingredients: {
    ingredientId: string;
    quantity: number | null;
    unit: string;
  }[],
) {
  const body = await created(
    await inject('POST', '/api/recipes', {
      title,
      servings: 4,
      steps: ['Сготви.'],
      tags: ['dinner'],
      ingredients,
    }),
  );
  return body.recipe.id as string;
}

async function patchMeal(id: string, payload: object) {
  const response = await inject('PATCH', `/api/menu/meals/${id}`, payload);
  expect(response.statusCode).toBe(200);
}

const ids = { tomato: '', oil: '', eggs: '', salt: '' };
const recipes = { salad: '', omelette: '', stew: '' };
/** The plan's meals by day, Monday first. */
let meals: string[] = [];

/**
 * Two users, three recipes of 4 servings sharing ingredients, and the menu of WEEK: seven dinners, one only a note
 * and one with 0 servings. Everything goes through the api, as the family would make it.
 */
async function seedMenu() {
  ids.tomato = await createIngredient('зелен домат', 'g', 'produce');
  ids.oil = await createIngredient('гроздово олио', 'ml', 'spices');
  ids.eggs = await createIngredient('пъдпъдъчи яйца', 'pcs', 'dairy');
  ids.salt = await createIngredient('хималайска сол', 'g', 'spices');
  recipes.salad = await createRecipe('Салата', [
    { ingredientId: ids.tomato, quantity: 500, unit: 'g' },
    { ingredientId: ids.oil, quantity: 0.05, unit: 'l' },
    { ingredientId: ids.salt, quantity: null, unit: 'pinch' },
  ]);
  recipes.omelette = await createRecipe('Омлет', [
    { ingredientId: ids.eggs, quantity: 6, unit: 'pcs' },
    { ingredientId: ids.oil, quantity: 30, unit: 'ml' },
    { ingredientId: ids.tomato, quantity: 0.2, unit: 'kg' },
  ]);
  recipes.stew = await createRecipe('Яхния', [
    { ingredientId: ids.tomato, quantity: 300, unit: 'g' },
    { ingredientId: ids.salt, quantity: 5, unit: 'g' },
  ]);
  const plan = (
    await created(await inject('POST', '/api/menu/plans', { weekStart: WEEK }))
  ).plan;
  meals = plan.meals.map((meal: { id: string }) => meal.id);
  const [mon, tue, wed, thu, fri, sat, sun] = meals as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  // Servings default to 1 each: 2 a meal.
  await patchMeal(mon, { recipeId: recipes.salad });
  await patchMeal(tue, { recipeId: recipes.omelette });
  await patchMeal(wed, { recipeId: recipes.stew });
  await patchMeal(thu, {
    recipeId: recipes.salad,
    servings: { [DANI.id]: 3, [POLI.id]: 2 },
  });
  await patchMeal(fri, { note: 'ядем навън' });
  await patchMeal(sat, {
    recipeId: recipes.omelette,
    servings: { [DANI.id]: 0, [POLI.id]: 0 },
  });
  await patchMeal(sun, { recipeId: recipes.stew });
}

interface Amount {
  quantity: number | null;
  unit: string | null;
}

/** The visible rows as `aisle title quantity unit[ + quantity unit…] ×sources`, in the list's order. */
function rows(list: {
  aisles: {
    aisle: string;
    items: (Amount & {
      title: string;
      extraAmounts?: Amount[];
      sources: unknown[];
    })[];
  }[];
}) {
  return list.aisles.flatMap(({ aisle, items }) =>
    items.map((item) => {
      const amounts = [item, ...(item.extraAmounts ?? [])]
        .map(({ quantity, unit }) => `${quantity} ${unit}`)
        .join(' + ');
      return `${aisle} ${item.title} ${amounts} ×${item.sources.length}`;
    }),
  );
}

function itemUrl(itemKey: string, action = '') {
  return `/api/shopping-lists/${WEEK}/items/${encodeURIComponent(itemKey)}${action}`;
}

function setChecked(itemKey: string, checked: boolean, actingUser = DANI.id) {
  return inject('PUT', itemUrl(itemKey, '/checked'), { checked }, actingUser);
}

function setHidden(itemKey: string, hidden: boolean) {
  return inject('PUT', itemUrl(itemKey, '/hidden'), { hidden });
}

/** The row of `itemKey` wherever it is in the list (an aisle or the hidden ones). */
async function itemOf(itemKey: string) {
  const { list } = (await getList()).json();
  return [
    ...list.aisles.flatMap((aisle: { items: unknown[] }) => aisle.items),
    ...list.hidden,
  ].find((item: { key: string }) => item.key === itemKey);
}

const key = {
  tomato: () => ids.tomato,
  eggs: () => ids.eggs,
};

describe('GET /api/shopping-lists/:weekStart', () => {
  it('answers the same list when asked twice at the same time', async () => {
    await seedMenu();
    const responses = await Promise.all([getList(), getList()]);
    expect(responses.map((r) => r.statusCode)).toEqual([200, 200]);
    await setChecked(key.tomato(), true);
    expect((await getList()).json().list.remaining).toBe(3);
  });

  it('stores nothing for a week that is only read, any Monday (#209)', async () => {
    for (const week of ['1999-01-04', WEEK, '2030-01-07']) {
      expect((await getList(week)).statusCode).toBe(200);
    }
    expect(await testDb().select().from(shoppingList)).toEqual([]);
  });

  it('answers the list without an acting user, as the tablet and the TV read it, and stores nothing (#219)', async () => {
    await seedMenu();
    const response = await app.inject({
      method: 'GET',
      url: `/api/shopping-lists/${WEEK}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().list).toMatchObject({
      weekStart: WEEK,
      hasMenu: true,
      total: 4,
    });
    expect(await testDb().select().from(shoppingList)).toEqual([]);
  });

  it('answers 400 for a week that does not start on Monday', async () => {
    const response = await getList('2026-11-03');
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('validation_error');
  });

  it('answers an empty list without a menu for a week without one (#129 D-11)', async () => {
    const response = await getList();
    expect(response.statusCode).toBe(200);
    expect(response.json().list).toEqual({
      weekStart: WEEK,
      hasMenu: false,
      aisles: [],
      hidden: [],
      pantryHidden: [],
      total: 0,
      remaining: 0,
    });
  });

  it('sums the menu’s ingredients per ingredient, one amount per unit, rounded up, by aisle', async () => {
    await seedMenu();
    const response = await getList();
    expect(response.statusCode).toBe(200);
    const { list } = response.json();
    // Tomato: 250 + 100 + 150 + 625 + 150 = 1275 g; oil: 25 + 15 + 62.5 ml; eggs: 3 (Saturday has 0 servings);
    // salt: 2.5 + 2.5 g in the stew and a pinch on Monday and Thursday, one row.
    expect(rows(list)).toEqual([
      'produce зелен домат 1280 g ×5',
      'dairy пъдпъдъчи яйца 3 pcs ×1',
      'spices гроздово олио 110 ml ×3',
      'spices хималайска сол 10 g + null pinch ×4',
    ]);
    expect(list).toMatchObject({
      weekStart: WEEK,
      hidden: [],
      total: 4,
      remaining: 4,
    });
    expect(list.aisles[0].items[0]).toMatchObject({
      key: key.tomato(),
      kind: 'computed',
      checkedBy: null,
      checkedAt: null,
      hidden: false,
    });
    expect(list.aisles[1].items[0].sources).toEqual([
      {
        date: '2026-11-03',
        mealId: meals[1],
        recipeTitle: 'Омлет',
        amounts: [{ quantity: 3, unit: 'pcs' }],
      },
    ]);
  });
});

describe('PUT …/items/:key/checked', () => {
  beforeEach(seedMenu);

  it('checks a computed item as the acting user at the time of the change', async () => {
    const response = await setChecked(key.tomato(), true);
    expect(response.statusCode).toBe(200);
    const checked = {
      key: key.tomato(),
      checkedBy: DANI.id,
      checkedAt: NOW.toISOString(),
      quantity: 1280,
    };
    expect(response.json().item).toMatchObject(checked);
    const { list } = (await getList()).json();
    expect(list.remaining).toBe(3);
    expect(await itemOf(key.tomato())).toMatchObject(checked);
  });

  it('keeps the first check when the other user checks it again (#129 D-04), and keeps it after the menu changes', async () => {
    await setChecked(key.tomato(), true);
    clock = new Date('2026-10-28T09:30:00Z');
    const response = await setChecked(key.tomato(), true, POLI.id);
    expect(response.json().item).toMatchObject({
      checkedBy: DANI.id,
      checkedAt: NOW.toISOString(),
    });
    // Monday's salad becomes a stew: 250 g of tomato become 150 g, the check stays.
    await patchMeal(meals[0] ?? '', { recipeId: recipes.stew });
    expect(await itemOf(key.tomato())).toMatchObject({
      quantity: 1180,
      checkedBy: DANI.id,
      checkedAt: NOW.toISOString(),
    });
  });

  it('unchecks an item and stores nothing for it any more', async () => {
    await setChecked(key.tomato(), true);
    const response = await setChecked(key.tomato(), false);
    expect(response.statusCode).toBe(200);
    expect(response.json().item).toMatchObject({
      key: key.tomato(),
      checkedBy: null,
      checkedAt: null,
      quantity: 1280,
    });
    expect(await testDb().select().from(shoppingItem)).toEqual([]);
    expect((await getList()).json().list.remaining).toBe(4);
  });

  it('answers 404 for a key that is not in the list as it is now computed', async () => {
    const elsewhere = '33333333-3333-4333-8333-333333333333';
    for (const unknown of [
      elsewhere,
      `${elsewhere}:g`,
      `${ids.eggs}:cup`,
      `manual:${elsewhere}`,
      'кафе',
    ]) {
      const response = await setChecked(unknown, true);
      expect(response.statusCode, unknown).toBe(404);
      expect(response.json().error).toBe('not_found');
    }
    // Saturday's omelette has 0 servings: once Tuesday's is gone, so are the eggs.
    await patchMeal(meals[1] ?? '', { recipeId: recipes.stew });
    expect((await setChecked(key.eggs(), true)).statusCode).toBe(404);
  });

  it('checks the ingredient’s row under an old key (<ingredientId>:<unit>), as a check queued offline sends it', async () => {
    const response = await setChecked(`${ids.salt}:pinch`, true);

    expect(response.statusCode).toBe(200);
    expect(response.json().item).toMatchObject({
      key: ids.salt,
      checkedBy: DANI.id,
    });
    expect(await itemOf(ids.salt)).toMatchObject({ checkedBy: DANI.id });
    expect(await setHidden(`${ids.eggs}:pcs`, true)).toMatchObject({
      statusCode: 200,
    });
    expect(await itemOf(ids.eggs)).toMatchObject({ hidden: true });
  });

  it('answers 404 for a computed key in a week without a menu', async () => {
    const response = await inject(
      'PUT',
      `/api/shopping-lists/2026-11-09/items/${encodeURIComponent(key.tomato())}/checked`,
      { checked: true },
    );
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe('not_found');
  });
});

describe('PUT …/items/:key/hidden', () => {
  beforeEach(seedMenu);

  it('hides a computed item apart from the aisles, and shows it again', async () => {
    const response = await setHidden(key.eggs(), true);
    expect(response.statusCode).toBe(200);
    expect(response.json().item).toMatchObject({
      key: key.eggs(),
      hidden: true,
      quantity: 3,
    });
    let { list } = (await getList()).json();
    expect(list.aisles.map((a: { aisle: string }) => a.aisle)).toEqual([
      'produce',
      'spices',
    ]);
    expect(list.hidden.map((item: { key: string }) => item.key)).toEqual([
      key.eggs(),
    ]);
    expect(list.total).toBe(3);

    expect((await setHidden(key.eggs(), false)).json().item.hidden).toBe(false);
    ({ list } = (await getList()).json());
    expect(list.hidden).toEqual([]);
    expect(await testDb().select().from(shoppingItem)).toEqual([]);
  });

  it('keeps the check of a hidden item', async () => {
    await setChecked(key.eggs(), true);
    await setHidden(key.eggs(), true);
    await setHidden(key.eggs(), false);
    expect(await itemOf(key.eggs())).toMatchObject({ checkedBy: DANI.id });
  });

  it('answers 404 for a key that is not in the list', async () => {
    expect(
      (await setHidden('33333333-3333-4333-8333-333333333333', true))
        .statusCode,
    ).toBe(404);
  });
});

describe('one row per ingredient (migration of the old keys)', () => {
  beforeEach(seedMenu);

  const DRIZZLE = new URL('../../drizzle/', import.meta.url);

  /** Runs the data migration again, as it ran once over the records stored before it; found by name, not number. */
  async function migrate() {
    const file = (await readdir(DRIZZLE)).find((name) =>
      name.endsWith('_shopping_item_per_ingredient.sql'),
    );
    expect(file).toBeDefined();
    const text = await readFile(new URL(file ?? '', DRIZZLE), 'utf8');
    for (const statement of text.split('--> statement-breakpoint')) {
      await testDb().execute(sql.raw(statement));
    }
  }

  it('moves the checks and hides stored per unit onto the ingredient’s row, the latest check winning', async () => {
    const [list] = await testDb()
      .insert(shoppingList)
      .values({ weekStart: WEEK })
      .returning();
    const listId = list?.id ?? '';
    const earlier = new Date('2026-10-27T08:00:00Z');
    await testDb()
      .insert(shoppingItem)
      .values([
        {
          listId,
          itemKey: `${ids.salt}:g`,
          kind: 'computed',
          checkedBy: DANI.id,
          checkedAt: earlier,
        },
        {
          listId,
          itemKey: `${ids.salt}:pinch`,
          kind: 'computed',
          checkedBy: POLI.id,
          checkedAt: NOW,
        },
        { listId, itemKey: `${ids.eggs}:pcs`, kind: 'computed', hidden: true },
        {
          listId,
          itemKey: `${ids.oil}:ml`,
          kind: 'computed',
          checkedBy: DANI.id,
          checkedAt: earlier,
        },
      ]);
    const manual = await created(
      await inject('POST', `/api/shopping-lists/${WEEK}/items`, {
        title: 'кафе',
      }),
    );

    await migrate();
    // Rows already per ingredient are kept as they are.
    await migrate();

    expect(await itemOf(ids.salt)).toMatchObject({
      checkedBy: POLI.id,
      checkedAt: NOW.toISOString(),
      hidden: false,
    });
    expect(await itemOf(ids.oil)).toMatchObject({
      checkedBy: DANI.id,
      checkedAt: earlier.toISOString(),
    });
    expect(await itemOf(ids.eggs)).toMatchObject({
      hidden: true,
      checkedBy: null,
    });
    const keys = (
      await testDb().select({ key: shoppingItem.itemKey }).from(shoppingItem)
    ).map((row) => row.key);
    expect(keys.sort()).toEqual(
      [ids.salt, ids.eggs, ids.oil, manual.item.key].sort(),
    );
  });
});

describe('manual items', () => {
  beforeEach(seedMenu);

  function addItem(payload: object) {
    return inject('POST', `/api/shopping-lists/${WEEK}/items`, payload);
  }

  it('adds a manual item, by default to the other aisle', async () => {
    const response = await addItem({ title: '  кафе ' });
    expect(response.statusCode).toBe(201);
    const { item } = response.json();
    expect(item).toEqual({
      key: expect.stringMatching(/^manual:[0-9a-f-]{36}$/),
      kind: 'manual',
      title: 'кафе',
      quantity: null,
      unit: null,
      aisle: 'other',
      checkedBy: null,
      checkedAt: null,
      hidden: false,
      sources: [],
    });
    const { list } = (await getList()).json();
    expect(list.aisles.at(-1)).toEqual({ aisle: 'other', items: [item] });
    expect(list.total).toBe(5);
  });

  it('keeps the quantity, unit and aisle it was given, next to the computed items', async () => {
    const { item } = (
      await addItem({ title: 'мляко', quantity: 2, unit: 'l', aisle: 'dairy' })
    ).json();
    expect(item).toMatchObject({ quantity: 2, unit: 'l', aisle: 'dairy' });
    expect(rows((await getList()).json().list)).toContain('dairy мляко 2 l ×0');
  });

  it('answers 400 for an item added without an acting user (#219)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/shopping-lists/${WEEK}/items`,
      payload: { title: 'кафе' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('missing_acting_user');
  });

  it('answers 400 for a blank or too long title', async () => {
    for (const title of ['   ', 'к'.repeat(61)]) {
      expect((await addItem({ title })).statusCode).toBe(400);
    }
  });

  it('checks and unchecks a manual item', async () => {
    const { item } = (await addItem({ title: 'кафе' })).json();
    const checked = await setChecked(item.key, true, POLI.id);
    expect(checked.statusCode).toBe(200);
    expect(checked.json().item).toMatchObject({
      key: item.key,
      checkedBy: POLI.id,
      checkedAt: NOW.toISOString(),
    });
    const unchecked = await setChecked(item.key, false);
    expect(unchecked.json().item).toMatchObject({
      checkedBy: null,
      checkedAt: null,
    });
    // Unchecked, the manual item is still there.
    expect(await itemOf(item.key)).toMatchObject({ title: 'кафе' });
  });

  it('answers 400 invalid_action for hiding a manual item', async () => {
    const { item } = (await addItem({ title: 'кафе' })).json();
    const response = await setHidden(item.key, true);
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('invalid_action');
  });

  it('deletes a manual item', async () => {
    const { item } = (await addItem({ title: 'кафе' })).json();
    const response = await inject('DELETE', itemUrl(item.key));
    expect(response.statusCode).toBe(204);
    expect(await itemOf(item.key)).toBeUndefined();
    expect((await inject('DELETE', itemUrl(item.key))).statusCode).toBe(404);
  });

  it('answers 400 invalid_action for deleting a computed item, which is hidden instead', async () => {
    const response = await inject('DELETE', itemUrl(key.tomato()));
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('invalid_action');
    expect(await itemOf(key.tomato())).toBeDefined();
  });
});

describe('a week without a menu (#129 D-11)', () => {
  function addItem(payload: object) {
    return inject('POST', `/api/shopping-lists/${WEEK}/items`, payload);
  }

  it('adds a manual item and reads it back, with no menu', async () => {
    const { item } = await created(await addItem({ title: 'кафе' }));

    const checked = await setChecked(item.key, true);

    expect(checked.statusCode).toBe(200);
    const { list } = (await getList()).json();
    expect(list).toMatchObject({ hasMenu: false, total: 1, remaining: 0 });
    expect(list.aisles).toEqual([
      {
        aisle: 'other',
        items: [expect.objectContaining({ title: 'кафе', checkedBy: DANI.id })],
      },
    ]);
  });

  it('adds the rows of a menu made later and keeps the manual item', async () => {
    const { item } = await created(await addItem({ title: 'кафе' }));

    await seedMenu();

    const { list } = (await getList()).json();
    expect(list).toMatchObject({ hasMenu: true, total: 5 });
    expect(rows(list)).toContain('produce зелен домат 1280 g ×5');
    expect(list.aisles.at(-1).items).toEqual([
      expect.objectContaining({ key: item.key, title: 'кафе' }),
    ]);
  });

  it('keeps the list and its manual item when the menu is deleted', async () => {
    await seedMenu();
    const { item } = await created(await addItem({ title: 'кафе' }));
    const { plan } = (
      await inject('GET', `/api/menu/plans?weekStart=${WEEK}`)
    ).json();

    const deleted = await inject('DELETE', `/api/menu/plans/${plan.id}`);

    expect(deleted.statusCode).toBe(204);
    const { list } = (await getList()).json();
    expect(list).toMatchObject({ hasMenu: false, total: 1 });
    expect(list.aisles[0].items[0].key).toBe(item.key);
  });
});

describe('the pantry in the list', () => {
  const NEXT_WEEK = '2026-11-09';
  const oilKey = () => ids.oil;

  /** NEXT_WEEK's menu: a stew on Monday, so tomato and salt but no oil. */
  async function seedNextWeek() {
    const plan = (
      await created(
        await inject('POST', '/api/menu/plans', { weekStart: NEXT_WEEK }),
      )
    ).plan;
    await patchMeal(plan.meals[0].id, { recipeId: recipes.stew });
  }

  async function addToPantry(
    ingredientId: string,
    kind: 'staple' | 'use_up',
    note?: string,
  ) {
    const body = await created(
      await inject('POST', '/api/pantry', { ingredientId, kind, note }),
    );
    return body.item.id as string;
  }

  function ranOut(pantryId: string) {
    return inject('POST', `/api/pantry/${pantryId}/ran-out`);
  }

  async function listOf(weekStart = WEEK) {
    const response = await getList(weekStart);
    expect(response.statusCode).toBe(200);
    return response.json().list;
  }

  beforeEach(async () => {
    await seedMenu();
    await seedNextWeek();
  });

  it('hides the row of a staple in every week, apart from the hidden rows', async () => {
    const pantryId = await addToPantry(ids.salt, 'staple');

    const list = await listOf();
    expect(rows(list)).toEqual([
      'produce зелен домат 1280 g ×5',
      'dairy пъдпъдъчи яйца 3 pcs ×1',
      'spices гроздово олио 110 ml ×3',
    ]);
    expect(list.hidden).toEqual([]);
    expect(list.pantryHidden).toMatchObject([
      {
        title: 'хималайска сол',
        unit: 'g',
        extraAmounts: [{ quantity: null, unit: 'pinch' }],
        pantry: { id: pantryId, kind: 'staple', ranOut: false },
      },
    ]);
    expect(list).toMatchObject({ total: 3, remaining: 3 });
    expect(rows(await listOf(NEXT_WEEK))).toEqual([
      'produce зелен домат 150 g ×1',
    ]);
  });

  it('shows a staple that ran out with its quantity where the menu wants it and without one where it does not', async () => {
    const pantryId = await addToPantry(ids.oil, 'staple');

    const response = await ranOut(pantryId);

    expect(response.statusCode).toBe(200);
    expect(response.json().item).toMatchObject({
      kind: 'staple',
      ranOutAt: NOW.toISOString(),
    });
    const list = await listOf();
    expect(rows(list)).toContain('spices гроздово олио 110 ml ×3');
    expect(list.pantryHidden).toEqual([]);
    expect(await itemOf(oilKey())).toMatchObject({
      pantry: { id: pantryId, kind: 'staple', ranOut: true },
    });
    expect(rows(await listOf(NEXT_WEEK))).toEqual([
      'produce зелен домат 150 g ×1',
      'spices гроздово олио null null ×0',
      'spices хималайска сол 10 g ×1',
    ]);
  });

  it('clears the ran-out flag with the check, signals every list, and keeps it cleared after unchecking', async () => {
    const pantryId = await addToPantry(ids.oil, 'staple');
    await ranOut(pantryId);
    const signals: unknown[] = [];
    const unsubscribe = app.events.subscribe((event) => signals.push(event));

    const response = await inject(
      'PUT',
      `/api/shopping-lists/${NEXT_WEEK}/items/${encodeURIComponent(oilKey())}/checked`,
      { checked: true },
    );
    unsubscribe();

    expect(response.statusCode).toBe(200);
    expect(response.json().item).toMatchObject({
      checkedBy: DANI.id,
      pantry: { ranOut: false },
    });
    expect(signals).toEqual([{ type: 'shopping.changed' }]);
    const [item] = (await inject('GET', '/api/pantry')).json().items;
    expect(item.ranOutAt).toBeNull();
    // Bought: the row stays checked in the list it was checked in, and is hidden by the pantry everywhere else.
    expect(rows(await listOf(NEXT_WEEK))).toContain(
      'spices гроздово олио null null ×0',
    );
    expect((await listOf()).pantryHidden).toMatchObject([{ key: oilKey() }]);

    await inject(
      'PUT',
      `/api/shopping-lists/${NEXT_WEEK}/items/${encodeURIComponent(oilKey())}/checked`,
      { checked: false },
    );
    expect(rows(await listOf(NEXT_WEEK))).not.toContain(
      'spices гроздово олио null null ×0',
    );
    expect(
      (await inject('GET', '/api/pantry')).json().items[0].ranOutAt,
    ).toBeNull();
  });

  it('buys a staple in several units with the one check of its row', async () => {
    const pantryId = await addToPantry(ids.salt, 'staple');
    await ranOut(pantryId);
    expect(rows(await listOf())).toContain(
      'spices хималайска сол 10 g + null pinch ×4',
    );

    await setChecked(ids.salt, true);

    expect(await itemOf(ids.salt)).toMatchObject({
      checkedBy: DANI.id,
      pantry: { ranOut: false },
    });
    expect((await listOf()).pantryHidden).toEqual([]);
  });

  it('shows a staple that ran out also where its row is hidden by hand, and „Покажи“ leaves the pantry as it is', async () => {
    const pantryId = await addToPantry(ids.oil, 'staple');
    await setHidden(oilKey(), true);

    await ranOut(pantryId);

    let list = await listOf();
    expect(rows(list)).toContain('spices гроздово олио 110 ml ×3');
    expect(list.hidden).toEqual([]);
    expect(list.pantryHidden).toEqual([]);

    await setHidden(oilKey(), false);
    list = await listOf();
    expect(rows(list)).toContain('spices гроздово олио 110 ml ×3');
    const [item] = (await inject('GET', '/api/pantry')).json().items;
    expect(item.ranOutAt).toBe(NOW.toISOString());
  });

  it('does not count a check from before the staple ran out', async () => {
    await setChecked(oilKey(), true);
    const pantryId = await addToPantry(ids.oil, 'staple');
    clock = new Date('2026-10-29T08:00:00Z');
    await ranOut(pantryId);

    expect(await itemOf(oilKey())).toMatchObject({
      checkedBy: null,
      pantry: { ranOut: true },
    });
  });

  it('keeps the row of a use-up item visible, with its note and the full quantity', async () => {
    const pantryId = await addToPantry(ids.eggs, 'use_up', 'фризер');

    const list = await listOf();
    expect(rows(list)).toContain('dairy пъдпъдъчи яйца 3 pcs ×1');
    expect(await itemOf(key.eggs())).toMatchObject({
      pantry: { id: pantryId, kind: 'use_up', note: 'фризер', ranOut: false },
    });
  });

  it('keeps the manual hidden apart from the pantry', async () => {
    const pantryId = await addToPantry(ids.oil, 'staple');
    await setHidden(oilKey(), true);
    let list = await listOf();
    expect(list.hidden).toMatchObject([{ key: oilKey() }]);
    expect(list.pantryHidden).toEqual([]);

    // „Покажи“ does not touch the pantry: the row is still hidden by it.
    await setHidden(oilKey(), false);
    list = await listOf();
    expect(list.hidden).toEqual([]);
    expect(list.pantryHidden).toMatchObject([{ key: oilKey() }]);

    // Out of the pantry, the row is back.
    await inject('DELETE', `/api/pantry/${pantryId}`);
    expect(rows(await listOf())).toContain('spices гроздово олио 110 ml ×3');
  });
});
