import {
  type CreateIngredient,
  type Ingredient,
  normalizeIngredientName,
  type UpdateIngredient,
} from '@family/shared';
import { desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type { Db, DbExecutor } from '../client.js';
import { escapeLike, likePattern } from '../like.js';
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

/** Shortest word of a multi-word search that close matches look for; shorter ones („на“, „с“) match too much. */
const MIN_CLOSE_MATCH_WORD = 3;

/**
 * Names containing `q`, best match first: the one equal to `q`'s canonical form (so `limit` never cuts it),
 * then names starting with `q`, then names with a word starting with `q`, then the rest; by name within each.
 * When `q` has several words and no name contains it whole, the close matches instead: names containing
 * any of its words of 3+ letters, most matched words first („пушен червен пипер“ → „червен пипер“).
 */
export async function searchIngredients(
  db: Db,
  { q, limit }: { q?: string; limit: number },
): Promise<Ingredient[]> {
  if (!q) {
    return db
      .select(ingredientColumns)
      .from(ingredient)
      .orderBy(ingredient.name)
      .limit(limit);
  }
  const text = normalizeIngredientName(q);
  const matches = await searchByWholeText(db, text, limit);
  const words = text.split(' ');
  if (matches.length > 0 || words.length < 2) {
    return matches;
  }
  return searchByWords(
    db,
    words.filter((word) => word.length >= MIN_CLOSE_MATCH_WORD),
    limit,
  );
}

function searchByWholeText(
  db: Db,
  text: string,
  limit: number,
): Promise<Ingredient[]> {
  const escaped = escapeLike(text);
  const rank = sql`case
    when ${canonicalName} = ${text} then 0
    when ${canonicalName} like ${`${escaped}%`} then 1
    when ${canonicalName} like ${`% ${escaped}%`} then 2
    else 3
  end`;
  return db
    .select(ingredientColumns)
    .from(ingredient)
    .where(ilike(ingredient.name, likePattern(text)))
    .orderBy(rank, ingredient.name)
    .limit(limit);
}

async function searchByWords(
  db: Db,
  words: string[],
  limit: number,
): Promise<Ingredient[]> {
  const unique = [...new Set(words)];
  if (unique.length === 0) {
    return [];
  }
  const matched = unique.map((word) =>
    ilike(ingredient.name, likePattern(word)),
  );
  const matchedCount = sql.join(
    matched.map((condition) => sql`(${condition})::int`),
    sql` + `,
  );
  return db
    .select(ingredientColumns)
    .from(ingredient)
    .where(or(...matched))
    .orderBy(desc(matchedCount), ingredient.name)
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

/** The whole registry as `recipe.normalize` links lines to it: id, canonical name and base unit, by name. */
export async function listRegistryIngredients(
  db: DbExecutor,
): Promise<Pick<Ingredient, 'id' | 'name' | 'unit'>[]> {
  return db
    .select({ id: ingredient.id, name: ingredient.name, unit: ingredient.unit })
    .from(ingredient)
    .orderBy(ingredient.name);
}

/** The ingredients among `ids` that exist, by name; a missing id is left out. */
export async function findIngredientsByIds(
  db: DbExecutor,
  ids: string[],
): Promise<Ingredient[]> {
  if (ids.length === 0) {
    return [];
  }
  return db
    .select(ingredientColumns)
    .from(ingredient)
    .where(inArray(ingredient.id, ids))
    .orderBy(ingredient.name);
}
