import {
  type CreateIngredient,
  type Ingredient,
  normalizeIngredientName,
  type UpdateIngredient,
} from '@family/shared';
import { desc, eq, ilike, inArray, sql } from 'drizzle-orm';
import type { Db, DbExecutor } from '../client.js';
import { likePattern } from '../like.js';
import { ingredient } from '../schema/food.js';

/** API shape of an ingredient: the DB row without `created_at`; also what a recipe line carries. */
export const ingredientColumns = {
  id: ingredient.id,
  name: ingredient.name,
  unit: ingredient.unit,
  aisle: ingredient.aisle,
};

/** The canonical name as the unique index `ingredient_name_key` compares it. */
const canonicalName = sql`lower(trim(${ingredient.name}))`;

/** Names containing `q`, ordered by name, but the one equal to `q`'s canonical form first so `limit` never cuts it. */
export async function searchIngredients(
  db: Db,
  { q, limit }: { q?: string; limit: number },
): Promise<Ingredient[]> {
  return db
    .select(ingredientColumns)
    .from(ingredient)
    .where(q ? ilike(ingredient.name, likePattern(q)) : undefined)
    .orderBy(
      ...(q ? [desc(eq(canonicalName, normalizeIngredientName(q)))] : []),
      ingredient.name,
    )
    .limit(limit);
}

/** The ingredient whose canonical name equals `name` (already normalized), as the unique index compares it. */
export async function findIngredientByName(
  db: Db,
  name: string,
): Promise<Ingredient | undefined> {
  const [row] = await db
    .select(ingredientColumns)
    .from(ingredient)
    .where(eq(canonicalName, name))
    .limit(1);
  return row;
}

/** Rejects with a unique violation (see `isUniqueViolation`) when the name is taken. */
export async function insertIngredient(
  db: Db,
  values: CreateIngredient,
): Promise<Ingredient> {
  const [row] = await db
    .insert(ingredient)
    .values(values)
    .returning(ingredientColumns);
  if (!row) {
    throw new Error('insert into ingredient returned no row');
  }
  return row;
}

export async function findIngredient(
  db: Db,
  id: string,
): Promise<Ingredient | undefined> {
  const [row] = await db
    .select(ingredientColumns)
    .from(ingredient)
    .where(eq(ingredient.id, id))
    .limit(1);
  return row;
}

/**
 * Sets the given fields; `undefined` when there is no such ingredient. Rejects with a unique violation
 * (see `isUniqueViolation`) when the new name is taken.
 */
export async function updateIngredient(
  db: Db,
  id: string,
  changes: UpdateIngredient,
): Promise<Ingredient | undefined> {
  if (Object.values(changes).every((value) => value === undefined)) {
    return findIngredient(db, id);
  }
  const [row] = await db
    .update(ingredient)
    .set(changes)
    .where(eq(ingredient.id, id))
    .returning(ingredientColumns);
  return row;
}

/** Which of `ids` name an existing ingredient. */
export async function existingIngredientIds(
  db: DbExecutor,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) {
    return new Set();
  }
  const rows = await db
    .select({ id: ingredient.id })
    .from(ingredient)
    .where(inArray(ingredient.id, ids));
  return new Set(rows.map((row) => row.id));
}

/** Every canonical ingredient name, ordered: the `ingredientNames` of `recipe.suggest`. */
export async function listIngredientNames(db: DbExecutor): Promise<string[]> {
  const rows = await db
    .select({ name: ingredient.name })
    .from(ingredient)
    .orderBy(ingredient.name);
  return rows.map((row) => row.name);
}
