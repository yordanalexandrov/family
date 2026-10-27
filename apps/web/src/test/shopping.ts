import {
  type ShoppingItem,
  type ShoppingList,
  shoppingListSchema,
  withCheck,
} from '@family/shared';
import { HttpResponse, http } from 'msw';
import { thisWeek } from './menu';
import { dani, server } from './msw';

// Фикстури за списъка за пазаруване (#44): седмицата от 2 ноември (`fixtureNow` е сряда, 4 ноември).

const ingredient = (n: number) => `c0000000-0000-4000-8000-00000000000${n}`;
const mealId = (n: number) => `eeeeeeee-1111-4000-8000-00000000000${n}`;

function computed(
  n: number,
  unit: ShoppingItem['unit'],
  overrides: Partial<ShoppingItem>,
): ShoppingItem {
  return {
    key: `${ingredient(n)}:${unit}`,
    kind: 'computed',
    ingredientId: ingredient(n),
    title: '',
    quantity: null,
    unit,
    aisle: 'other',
    checkedBy: null,
    checkedAt: null,
    hidden: false,
    sources: [],
    ...overrides,
  };
}

export const tomatoes = computed(1, 'g', {
  title: 'Домати',
  quantity: 500,
  aisle: 'produce',
  sources: [
    { date: '2026-11-02', mealId: mealId(0), recipeTitle: 'Пиле с ориз' },
    {
      date: '2026-11-06',
      mealId: mealId(4),
      recipeTitle: 'Паста с доматен сос',
    },
  ],
});

export const onions = computed(2, 'pcs', {
  title: 'Лук',
  quantity: 2,
  aisle: 'produce',
  sources: [
    { date: '2026-11-02', mealId: mealId(0), recipeTitle: 'Пиле с ориз' },
  ],
});

export const peppers = computed(3, 'pcs', {
  title: 'Чушки',
  quantity: 3,
  aisle: 'produce',
  checkedBy: dani.id,
  checkedAt: '2026-11-04T08:00:00.000Z',
  sources: [{ date: '2026-11-03', mealId: mealId(1), recipeTitle: 'Мусака' }],
});

export const milk = computed(4, 'ml', {
  title: 'Мляко',
  quantity: 1000,
  aisle: 'dairy',
  sources: [{ date: '2026-11-03', mealId: mealId(1), recipeTitle: 'Мусака' }],
});

export const salt = computed(5, 'pinch', {
  title: 'Сол',
  aisle: 'spices',
  sources: [{ date: '2026-11-03', mealId: mealId(1), recipeTitle: 'Мусака' }],
});

export const oil = computed(6, 'ml', {
  title: 'Олио',
  quantity: 50,
  aisle: 'spices',
  hidden: true,
  sources: [
    { date: '2026-11-02', mealId: mealId(0), recipeTitle: 'Пиле с ориз' },
  ],
});

export const coffee: ShoppingItem = {
  key: 'manual:d0000000-0000-4000-8000-000000000001',
  kind: 'manual',
  title: 'Кафе',
  quantity: 2,
  unit: 'pcs',
  aisle: 'other',
  checkedBy: null,
  checkedAt: null,
  hidden: false,
  sources: [],
};

/** Списъкът на тази седмица: 6 видими реда (1 отметнат) в 4 щанда и 1 скрит. */
export function shoppingList(weekStart = thisWeek): ShoppingList {
  return shoppingListSchema.parse({
    weekStart,
    aisles: [
      { aisle: 'produce', items: [tomatoes, onions, peppers] },
      { aisle: 'dairy', items: [milk] },
      { aisle: 'spices', items: [salt] },
      { aisle: 'other', items: [coffee] },
    ],
    hidden: [oil],
    total: 6,
    remaining: 5,
  });
}

export function noPlan() {
  return HttpResponse.json(
    {
      error: 'not_found',
      code: 'no_plan',
      message: 'Няма меню за тази седмица',
    },
    { status: 404 },
  );
}

export interface ShoppingRequest {
  method: string;
  path: string;
  body: unknown;
  actingUser: string | null;
}

/**
 * `/api/shopping-lists/:weekStart…` върху `lists` като api: седмица без списък е 404 `no_plan`; отметката се
 * прилага като в api (отметнатите в края на щанда). Връща заявките за промяна по ред.
 */
export function serveShopping(lists: Record<string, ShoppingList> = {}) {
  const requests: ShoppingRequest[] = [];
  const gets: string[] = [];
  const base = '/api/shopping-lists/:weekStart';
  async function record(request: Request, path: string) {
    const body = request.method === 'DELETE' ? undefined : await request.json();
    requests.push({
      method: request.method,
      path,
      body,
      actingUser: request.headers.get('x-acting-user'),
    });
    return body as Record<string, unknown>;
  }
  const notFound = () =>
    HttpResponse.json(
      { error: 'not_found', message: 'Няма такъв ред' },
      { status: 404 },
    );
  const find = (list: ShoppingList, key: string) =>
    [...list.aisles.flatMap((a) => a.items), ...list.hidden].find(
      (item) => item.key === key,
    );

  server.use(
    http.get(base, ({ params }) => {
      const week = String(params.weekStart);
      gets.push(week);
      const list = lists[week];
      return list ? HttpResponse.json({ list }) : noPlan();
    }),
    http.put(`${base}/items/:key/checked`, async ({ params, request }) => {
      const week = String(params.weekStart);
      const key = String(params.key);
      const body = await record(request, `${week}/items/${key}/checked`);
      const list = lists[week];
      if (!list) {
        return noPlan();
      }
      if (!find(list, key)) {
        return notFound();
      }
      const checked = body.checked === true;
      lists[week] = withCheck(list, key, {
        checkedBy: checked ? request.headers.get('x-acting-user') : null,
        checkedAt: checked ? '2026-11-04T08:30:00.000Z' : null,
      });
      return HttpResponse.json({ item: find(lists[week], key) });
    }),
    http.put(`${base}/items/:key/hidden`, async ({ params, request }) => {
      const week = String(params.weekStart);
      const key = String(params.key);
      await record(request, `${week}/items/${key}/hidden`);
      const list = lists[week];
      const item = list && find(list, key);
      return item ? HttpResponse.json({ item }) : notFound();
    }),
    http.post(`${base}/items`, async ({ params, request }) => {
      const week = String(params.weekStart);
      const body = await record(request, `${week}/items`);
      const item: ShoppingItem = {
        ...coffee,
        key: 'manual:d0000000-0000-4000-8000-000000000002',
        title: String(body.title),
        quantity: typeof body.quantity === 'number' ? body.quantity : null,
        unit: (body.unit as ShoppingItem['unit']) ?? null,
        aisle: (body.aisle as ShoppingItem['aisle']) ?? 'other',
      };
      return HttpResponse.json({ item }, { status: 201 });
    }),
    http.delete(`${base}/items/:key`, async ({ params, request }) => {
      const week = String(params.weekStart);
      await record(request, `${week}/items/${String(params.key)}`);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return { requests, gets, lists };
}

// Килерът в списъка (#91): временен ред, свършил постоянен с количество и без, двама скрити от килера.
const pantryId = (n: number) => `dddddddd-1111-4000-8000-00000000000${n}`;

export const mince = computed(7, 'g', {
  title: 'Кайма',
  quantity: 500,
  aisle: 'meat',
  sources: [{ date: '2026-11-03', mealId: mealId(1), recipeTitle: 'Мусака' }],
  pantry: { id: pantryId(1), kind: 'use_up', note: 'фризер', ranOut: false },
});

export const ranOutMilk: ShoppingItem = {
  ...milk,
  pantry: { id: pantryId(2), kind: 'staple', ranOut: true },
};

/** Свършил постоянен продукт, който менюто не иска: ред без количество. */
export const ranOutOil = computed(8, null, {
  key: `${ingredient(8)}:none`,
  title: 'Слънчогледово олио',
  aisle: 'spices',
  pantry: { id: pantryId(3), kind: 'staple', ranOut: true },
});

export const pantrySalt: ShoppingItem = {
  ...salt,
  pantry: { id: pantryId(4), kind: 'staple', ranOut: false },
};

export const pantryRice = computed(9, 'g', {
  title: 'Ориз',
  quantity: 400,
  aisle: 'grains',
  sources: [
    { date: '2026-11-02', mealId: mealId(0), recipeTitle: 'Пиле с ориз' },
  ],
  pantry: { id: pantryId(5), kind: 'staple', ranOut: false },
});

/** Списъкът на тази седмица с килера: 4 видими реда и 2 скрити от килера. */
export function pantryShoppingList(weekStart = thisWeek): ShoppingList {
  return shoppingListSchema.parse({
    weekStart,
    aisles: [
      { aisle: 'produce', items: [tomatoes] },
      { aisle: 'meat', items: [mince] },
      { aisle: 'dairy', items: [ranOutMilk] },
      { aisle: 'spices', items: [ranOutOil] },
    ],
    hidden: [],
    pantryHidden: [pantryRice, pantrySalt],
    total: 4,
    remaining: 4,
  });
}
