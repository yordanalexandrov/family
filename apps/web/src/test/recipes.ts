import type { Ingredient, Recipe, RecipeSummary } from '@family/shared';
import { HttpResponse, http } from 'msw';
import { server } from './msw';

// Фикстури за регистъра рецепти (#24): продукти от seed-а и две рецепти.
export const chicken: Ingredient = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  name: 'пилешко филе',
  unit: 'g',
  aisle: 'meat',
};

export const onion: Ingredient = {
  id: 'aaaaaaaa-0000-4000-8000-000000000002',
  name: 'лук',
  unit: 'pcs',
  aisle: 'produce',
};

export const salt: Ingredient = {
  id: 'aaaaaaaa-0000-4000-8000-000000000003',
  name: 'сол',
  unit: 'g',
  aisle: 'spices',
};

export const ingredients = [chicken, onion, salt];

export const chickenWithRice: Recipe = {
  id: 'bbbbbbbb-0000-4000-8000-000000000001',
  title: 'Пиле с ориз',
  servings: 4,
  prepMinutes: 45,
  tags: ['lunch', 'kid_friendly'],
  steps: [{ text: 'Нарежи пилето.' }, { text: 'Задуши с лука.' }],
  sourceUrl: 'https://recepti.example/pile-s-oriz',
  nutritionPer100g: { kcal: 150, proteinG: 12, fatG: 5, carbsG: 14 },
  preparation: [],
  ingredients: [
    { ingredientId: chicken.id, quantity: 500, unit: 'g', ingredient: chicken },
    { ingredientId: onion.id, quantity: 2, unit: 'pcs', ingredient: onion },
    { ingredientId: salt.id, quantity: null, unit: 'pinch', ingredient: salt },
  ],
  archivedAt: null,
  rating: null,
  createdAt: '2026-10-20T10:00:00.000Z',
  updatedAt: '2026-10-20T10:00:00.000Z',
  openRevision: null,
};

export const omelette: Recipe = {
  id: 'bbbbbbbb-0000-4000-8000-000000000002',
  title: 'Омлет',
  servings: 2,
  prepMinutes: 10,
  tags: ['breakfast', 'quick'],
  steps: [{ text: 'Разбий яйцата.' }, { text: 'Изпържи.' }],
  preparation: [],
  ingredients: [],
  archivedAt: null,
  rating: null,
  createdAt: '2026-10-21T10:00:00.000Z',
  updatedAt: '2026-10-21T10:00:00.000Z',
  openRevision: null,
};

export function toSummary(recipe: Recipe): RecipeSummary {
  const {
    id,
    title,
    servings,
    prepMinutes,
    tags,
    archivedAt,
    rating,
    openRevision,
  } = recipe;
  return {
    id,
    title,
    servings,
    prepMinutes,
    tags,
    archivedAt,
    rating,
    openRevision,
  };
}

/** Една заявка за оценка: `rating: null` е `DELETE`. */
export interface RatingCall {
  id: string;
  rating: number | null;
}

/**
 * `PUT`/`DELETE /api/recipes/:id/rating`: връща рецептата (по `recipes`, иначе `chickenWithRice` с този id) с новата
 * оценка и вика `onRate`, за да може фикстурата на менюто да я запомни. Връща заявките по ред.
 */
export function serveRating(
  recipes: Recipe[] = [],
  onRate: (call: RatingCall) => void = () => {},
) {
  const calls: RatingCall[] = [];
  const answer = (id: string, rating: number | null) => {
    calls.push({ id, rating });
    onRate({ id, rating });
    const base = recipes.find((recipe) => recipe.id === id) ?? {
      ...chickenWithRice,
      id,
    };
    return HttpResponse.json({ recipe: { ...base, rating } });
  };
  server.use(
    http.put<{ id: string }, { rating: number }>(
      '/api/recipes/:id/rating',
      async ({ params, request }) =>
        answer(params.id, (await request.json()).rating),
    ),
    http.delete<{ id: string }>('/api/recipes/:id/rating', ({ params }) =>
      answer(params.id, null),
    ),
  );
  return calls;
}
