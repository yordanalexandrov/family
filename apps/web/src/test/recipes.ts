import type { Ingredient, Recipe, RecipeSummary } from '@family/shared';

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
  steps: ['Нарежи пилето.', 'Задуши с лука.'],
  sourceUrl: 'https://recepti.example/pile-s-oriz',
  nutritionPer100g: { kcal: 150, proteinG: 12, fatG: 5, carbsG: 14 },
  ingredients: [
    { ingredientId: chicken.id, quantity: 500, unit: 'g', ingredient: chicken },
    { ingredientId: onion.id, quantity: 2, unit: 'pcs', ingredient: onion },
    { ingredientId: salt.id, quantity: null, unit: 'pinch', ingredient: salt },
  ],
  archivedAt: null,
  createdAt: '2026-10-20T10:00:00.000Z',
  updatedAt: '2026-10-20T10:00:00.000Z',
};

export const omelette: Recipe = {
  id: 'bbbbbbbb-0000-4000-8000-000000000002',
  title: 'Омлет',
  servings: 2,
  prepMinutes: 10,
  tags: ['breakfast', 'quick'],
  steps: ['Разбий яйцата.', 'Изпържи.'],
  ingredients: [],
  archivedAt: null,
  createdAt: '2026-10-21T10:00:00.000Z',
  updatedAt: '2026-10-21T10:00:00.000Z',
};

export function toSummary(recipe: Recipe): RecipeSummary {
  const { id, title, servings, prepMinutes, tags, archivedAt } = recipe;
  return { id, title, servings, prepMinutes, tags, archivedAt };
}
