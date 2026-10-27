import type { Ingredient, PantryItem } from '@family/shared';
import { HttpResponse, http } from 'msw';
import { server } from './msw';

// Фикстури за килера (#90). `fixtureNow` е сряда, 4 ноември 2026, 10:00 в София.
export const rice: Ingredient = {
  id: 'cccccccc-0000-4000-8000-000000000001',
  name: 'ориз',
  unit: 'g',
  aisle: 'grains',
};
export const salt: Ingredient = {
  id: 'cccccccc-0000-4000-8000-000000000002',
  name: 'сол',
  unit: 'g',
  aisle: 'spices',
};
export const mince: Ingredient = {
  id: 'cccccccc-0000-4000-8000-000000000003',
  name: 'кайма',
  unit: 'g',
  aisle: 'meat',
};
export const cheese: Ingredient = {
  id: 'cccccccc-0000-4000-8000-000000000004',
  name: 'сирене',
  unit: 'g',
  aisle: 'dairy',
};
export const oil: Ingredient = {
  id: 'cccccccc-0000-4000-8000-000000000005',
  name: 'олио',
  unit: 'ml',
  aisle: 'grains',
};

export const pantryIngredients = [rice, salt, mince, cheese, oil];

let nextId = 0;

/** Ред от килера за `ingredient`; `createdAt` по подразбиране е денят на фикстурата. */
export function pantryItem(
  ingredient: Ingredient,
  overrides: Partial<PantryItem> = {},
): PantryItem {
  nextId += 1;
  return {
    id: `dddddddd-0000-4000-8000-${String(nextId).padStart(12, '0')}`,
    ingredient: {
      id: ingredient.id,
      name: ingredient.name,
      aisle: ingredient.aisle,
    },
    kind: 'staple',
    note: null,
    ranOutAt: null,
    createdAt: '2026-11-04T07:00:00.000Z',
    ...overrides,
  };
}

export interface PantryRequest {
  method: string;
  id?: string;
  body?: unknown;
}

/**
 * `/api/pantry` като api: килер в паметта, `POST` с 409 за продукт, който вече е там, `PATCH` и `DELETE`;
 * `/api/ingredients?q=` търси в `pantryIngredients`. Връща заявките за промяна по ред.
 */
export function servePantry(initial: PantryItem[] = []) {
  let items = [...initial];
  const requests: PantryRequest[] = [];
  server.use(
    http.get('/api/ingredients', ({ request }) => {
      const q = new URL(request.url).searchParams.get('q') ?? '';
      return HttpResponse.json({
        ingredients: pantryIngredients.filter((i) => i.name.includes(q)),
      });
    }),
    http.get('/api/pantry', () => HttpResponse.json({ items })),
    http.post('/api/pantry', async ({ request }) => {
      const body = (await request.json()) as {
        ingredientId: string;
        kind: PantryItem['kind'];
        note?: string | null;
      };
      requests.push({ method: 'POST', body });
      if (items.some((item) => item.ingredient.id === body.ingredientId)) {
        return HttpResponse.json(
          {
            error: 'conflict',
            code: 'already_in_pantry',
            message: 'Продуктът вече е в килера',
          },
          { status: 409 },
        );
      }
      const ingredient = pantryIngredients.find(
        (i) => i.id === body.ingredientId,
      );
      if (!ingredient) {
        return HttpResponse.json(
          { error: 'invalid_reference', message: 'Няма такъв продукт' },
          { status: 400 },
        );
      }
      const item = pantryItem(ingredient, {
        kind: body.kind,
        note: body.note ?? null,
        createdAt: new Date().toISOString(),
      });
      items = [...items, item];
      return HttpResponse.json({ item }, { status: 201 });
    }),
    http.patch('/api/pantry/:id', async ({ params, request }) => {
      const id = String(params.id);
      const body = (await request.json()) as Partial<PantryItem>;
      requests.push({ method: 'PATCH', id, body });
      const current = items.find((item) => item.id === id);
      if (!current) {
        return HttpResponse.json(
          { error: 'not_found', message: 'Няма такъв продукт в килера' },
          { status: 404 },
        );
      }
      const item = { ...current, ...body };
      items = items.map((other) => (other.id === id ? item : other));
      return HttpResponse.json({ item });
    }),
    http.delete('/api/pantry/:id', ({ params }) => {
      const id = String(params.id);
      requests.push({ method: 'DELETE', id });
      items = items.filter((item) => item.id !== id);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return requests;
}
