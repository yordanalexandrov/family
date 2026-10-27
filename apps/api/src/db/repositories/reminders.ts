import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { DbExecutor } from '../client.js';
import { ingredient, recipe, recipeIngredient } from '../schema/food.js';
import { meal } from '../schema/menu.js';
import { pantryItem } from '../schema/pantry.js';

/** A dinner as the reminders read it: its recipe's title and products (in the recipe's order), and „Извадих“. */
export interface ReminderMealRow {
  id: string;
  date: string;
  title: string | null;
  ingredients: { id: string; name: string }[];
  thawedAt: Date | null;
}

/** The dinners on `dates`, of whatever plan holds them; a meal without a recipe has no title and no products. */
export async function listReminderDinners(
  db: DbExecutor,
  dates: string[],
): Promise<ReminderMealRow[]> {
  const meals = await db
    .select({
      id: meal.id,
      date: meal.date,
      recipeId: meal.recipeId,
      title: recipe.title,
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

/** „Извадих“ for the meal at `at`, unless it is already; answers `false` when there is no such meal. */
export async function markMealThawed(
  db: DbExecutor,
  id: string,
  at: Date,
): Promise<boolean> {
  const rows = await db
    .update(meal)
    .set({
      thawedAt: sql`coalesce(${meal.thawedAt}, ${at.toISOString()}::timestamptz)`,
    })
    .where(eq(meal.id, id))
    .returning({ thawedAt: meal.thawedAt });
  return rows.length > 0;
}
