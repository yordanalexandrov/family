import type { DateKey } from '@family/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { DbExecutor } from '../client.js';
import { ingredient, recipe, recipeIngredient } from '../schema/food.js';
import { meal } from '../schema/menu.js';
import { pantryItem } from '../schema/pantry.js';

/** A dinner of the menu as the reminders see it; `title` and `ingredients` are its recipe's, `null`/empty without one. */
export interface ReminderMeal {
  id: string;
  date: DateKey;
  title: string | null;
  /** The recipe's products, in its order. */
  ingredients: { id: string; name: string }[];
  note: string | null;
  cookUserId: string | null;
  /** „Извадих“ (GLOSSARY): someone took the meat out. */
  thawedAt: Date | null;
}

/** The dinners on `dates`, of whatever plan holds them; a meal without a recipe has no title and no products. */
export async function listReminderDinners(
  db: DbExecutor,
  dates: DateKey[],
): Promise<ReminderMeal[]> {
  const meals = await db
    .select({
      id: meal.id,
      date: meal.date,
      recipeId: meal.recipeId,
      title: recipe.title,
      note: meal.note,
      cookUserId: meal.cookUserId,
      thawedAt: meal.thawedAt,
    })
    .from(meal)
    .leftJoin(recipe, eq(recipe.id, meal.recipeId))
    .where(and(eq(meal.slot, 'dinner'), inArray(meal.date, dates)))
    .orderBy(asc(meal.date));
  const recipeIds = meals.flatMap((row) =>
    row.recipeId ? [row.recipeId] : [],
  );
  const lines =
    recipeIds.length === 0
      ? []
      : await db
          .select({
            recipeId: recipeIngredient.recipeId,
            id: ingredient.id,
            name: ingredient.name,
          })
          .from(recipeIngredient)
          .innerJoin(
            ingredient,
            eq(ingredient.id, recipeIngredient.ingredientId),
          )
          .where(inArray(recipeIngredient.recipeId, recipeIds))
          .orderBy(asc(recipeIngredient.position));
  return meals.map(({ recipeId, ...row }) => ({
    ...row,
    ingredients: lines
      .filter((line) => line.recipeId === recipeId)
      .map(({ id, name }) => ({ id, name })),
  }));
}

/** The ingredient ids of the pantry products „Във фризера“ (GLOSSARY). */
export async function listFrozenIngredientIds(
  db: DbExecutor,
): Promise<string[]> {
  const rows = await db
    .select({ id: pantryItem.ingredientId })
    .from(pantryItem)
    .where(eq(pantryItem.frozen, true));
  return rows.map((row) => row.id);
}
