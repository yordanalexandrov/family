import type { Servings } from '../schemas/menu.js';

/** What is cooked (GLOSSARY: Ястие): the recipe's title, else the note; `null` for an empty meal. */
export function mealTitle(meal: {
  recipe: { title: string } | null;
  note: string | null;
}): string | null {
  return meal.recipe?.title ?? meal.note;
}

/** The servings of a new meal: 1 for each user (GLOSSARY: Порции). */
export function oneServingEach(userIds: readonly string[]): Servings {
  return Object.fromEntries(userIds.map((id) => [id, 1]));
}

/** Whether the servings are still the default of a new meal, 1 for each of `userIds` and nobody else. */
export function isOneServingEach(
  servings: Servings,
  userIds: readonly string[],
): boolean {
  return (
    Object.keys(servings).length === userIds.length &&
    userIds.every((id) => servings[id] === 1)
  );
}

/** The servings of all users together. */
export function totalServings(servings: Servings): number {
  return Object.values(servings).reduce((total, n) => total + n, 0);
}
