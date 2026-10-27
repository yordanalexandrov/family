import type { PantryItem, PantryKind, UseUp } from '@family/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '../client.js';
import { ingredient } from '../schema/food.js';
import { pantryItem } from '../schema/pantry.js';

/** The unique index that keeps an ingredient in the pantry at most once. */
export const PANTRY_INGREDIENT_UNIQUE = 'pantry_item_ingredient_id_unique';

const columns = {
  id: pantryItem.id,
  kind: pantryItem.kind,
  note: pantryItem.note,
  ranOutAt: pantryItem.ranOutAt,
  createdAt: pantryItem.createdAt,
  ingredient: {
    id: ingredient.id,
    name: ingredient.name,
    aisle: ingredient.aisle,
  },
};

type Row = {
  id: string;
  kind: PantryKind;
  note: string | null;
  ranOutAt: Date | null;
  createdAt: Date;
  ingredient: PantryItem['ingredient'];
};

function toPantryItem(row: Row): PantryItem {
  return {
    ...row,
    ranOutAt: row.ranOutAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function select(db: DbExecutor) {
  return db
    .select(columns)
    .from(pantryItem)
    .innerJoin(ingredient, eq(ingredient.id, pantryItem.ingredientId));
}

/** Staples first, by name; then use-up items, the oldest first. */
export async function listPantryItems(db: DbExecutor): Promise<PantryItem[]> {
  const rows = await select(db).orderBy(
    sql`${pantryItem.kind} = 'use_up'`,
    sql`case when ${pantryItem.kind} = 'use_up' then ${pantryItem.createdAt} end`,
    ingredient.name,
  );
  return rows.map(toPantryItem);
}

export async function findPantryItem(
  db: DbExecutor,
  id: string,
): Promise<PantryItem | undefined> {
  const [row] = await select(db).where(eq(pantryItem.id, id)).limit(1);
  return row && toPantryItem(row);
}

/** Rejects with a unique violation on `PANTRY_INGREDIENT_UNIQUE` when the ingredient is in the pantry already. */
export async function insertPantryItem(
  db: DbExecutor,
  values: { ingredientId: string; kind: PantryKind; note: string | null },
): Promise<string> {
  const [row] = await db
    .insert(pantryItem)
    .values(values)
    .returning({ id: pantryItem.id });
  if (!row) {
    throw new Error('insert into pantry_item returned no row');
  }
  return row.id;
}

/** Whether there was such an item. A use-up item never ran out, so `ran_out_at` goes with a change to `use_up`. */
export async function updatePantryItem(
  db: DbExecutor,
  id: string,
  changes: { kind?: PantryKind; note?: string | null },
): Promise<boolean> {
  const rows = await db
    .update(pantryItem)
    .set({
      ...changes,
      ...(changes.kind === 'use_up' ? { ranOutAt: null } : {}),
    })
    .where(eq(pantryItem.id, id))
    .returning({ id: pantryItem.id });
  return rows.length > 0;
}

/** Whether there was such an item. */
export async function deletePantryItem(
  db: DbExecutor,
  id: string,
): Promise<boolean> {
  const rows = await db
    .delete(pantryItem)
    .where(eq(pantryItem.id, id))
    .returning({ id: pantryItem.id });
  return rows.length > 0;
}

/**
 * Sets or clears `ran_out_at` of a staple („Свърши“, or bought); whether there was such a staple. A use-up item never
 * runs out, so it is left as it is.
 */
export async function setPantryRanOut(
  db: DbExecutor,
  id: string,
  ranOutAt: Date | null,
): Promise<boolean> {
  const rows = await db
    .update(pantryItem)
    .set({ ranOutAt })
    .where(and(eq(pantryItem.id, id), eq(pantryItem.kind, 'staple')))
    .returning({ id: pantryItem.id });
  return rows.length > 0;
}

/** The use-up products as the AI contracts see them (`useUp`), the oldest first; staples stay out. */
export async function listUseUp(db: DbExecutor): Promise<UseUp[]> {
  const rows = await db
    .select({ name: ingredient.name, note: pantryItem.note })
    .from(pantryItem)
    .innerJoin(ingredient, eq(ingredient.id, pantryItem.ingredientId))
    .where(eq(pantryItem.kind, 'use_up'))
    .orderBy(pantryItem.createdAt, ingredient.name);
  return rows.map(({ name, note }) =>
    note === null ? { name } : { name, note },
  );
}
