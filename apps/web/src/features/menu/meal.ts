import type { Meal } from '@family/shared';

/** Какво се готви: заглавието на рецептата, иначе бележката; `null` за празно ястие. */
export function mealTitle(meal: Meal): string | null {
  return meal.recipe?.title ?? meal.note;
}

/** Порциите на всички потребители заедно. */
export function totalServings(meal: Meal): number {
  return Object.values(meal.servings).reduce((sum, n) => sum + n, 0);
}
