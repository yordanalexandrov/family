import { randomUUID } from 'node:crypto';
import {
  type CreateManualItem,
  manualItemKey,
  type ShoppingItemRecord,
} from '@family/shared';
import { and, eq } from 'drizzle-orm';
import type { DbExecutor } from '../client.js';
import {
  shoppingItem,
  shoppingList,
  shoppingMeal,
} from '../schema/shopping.js';

type ItemRow = typeof shoppingItem.$inferSelect;

/** What `buildShoppingList` reads of a stored item: numeric comes back from pg as a string, dates as `Date`. */
function toRecord(row: ItemRow): ShoppingItemRecord {
  return {
    itemKey: row.itemKey,
    kind: row.kind,
    title: row.title,
    quantity: row.quantity === null ? null : Number(row.quantity),
    unit: row.unit,
    aisle: row.aisle,
    hidden: row.hidden,
    checkedBy: row.checkedBy,
    checkedAt: row.checkedAt?.toISOString() ?? null,
  };
}

/**
 * The id of the week's shopping list, created on the first call and linked to the week's menu once there is one
 * (`planId`), so its manual items stay when the menu comes later; safe to call concurrently.
 */
export async function ensureShoppingList(
  db: DbExecutor,
  weekStart: string,
  planId: string | null,
): Promise<string> {
  await db
    .insert(shoppingList)
    .values({ weekStart, planId })
    .onConflictDoNothing();
  const [row] = await db
    .select({ id: shoppingList.id, planId: shoppingList.planId })
    .from(shoppingList)
    .where(eq(shoppingList.weekStart, weekStart))
    .limit(1);
  if (!row) {
    throw new Error(`shopping list of week ${weekStart} vanished`);
  }
  if (planId !== null && row.planId !== planId) {
    await db
      .update(shoppingList)
      .set({ planId })
      .where(eq(shoppingList.id, row.id));
  }
  return row.id;
}

/** The id of the week's shopping list, `undefined` while nothing has been written to it. */
export async function findShoppingListId(
  db: DbExecutor,
  weekStart: string,
): Promise<string | undefined> {
  const [row] = await db
    .select({ id: shoppingList.id })
    .from(shoppingList)
    .where(eq(shoppingList.weekStart, weekStart))
    .limit(1);
  return row?.id;
}

/** Every stored item of the list: the overlay of computed items and the manual items. */
export async function listShoppingItems(
  db: DbExecutor,
  listId: string,
): Promise<ShoppingItemRecord[]> {
  const rows = await db
    .select()
    .from(shoppingItem)
    .where(eq(shoppingItem.listId, listId));
  return rows.map(toRecord);
}

/** A check (GLOSSARY: Отметка): who and when, or both `null` to clear it. */
export interface ItemCheck {
  checkedBy: string | null;
  checkedAt: Date | null;
}

/**
 * Writes the check and/or `hidden` of a computed item (upsert by key) and deletes the record when it is left with
 * neither, so that only items with something to keep are stored. Returns the record, `undefined` once deleted.
 */
export async function setComputedItemOverlay(
  db: DbExecutor,
  listId: string,
  itemKey: string,
  overlay: Partial<ItemCheck & { hidden: boolean }>,
): Promise<ShoppingItemRecord | undefined> {
  const [row] = await db
    .insert(shoppingItem)
    .values({ listId, itemKey, kind: 'computed', ...overlay })
    .onConflictDoUpdate({
      target: [shoppingItem.listId, shoppingItem.itemKey],
      set: overlay,
    })
    .returning();
  if (!row) {
    throw new Error(`upsert of ${itemKey} returned nothing`);
  }
  if (row.checkedBy === null && row.checkedAt === null && !row.hidden) {
    await db.delete(shoppingItem).where(eq(shoppingItem.id, row.id));
    return undefined;
  }
  return toRecord(row);
}

/** A new manual item (GLOSSARY: Ръчен ред) keyed `manual:<id>`. */
export async function insertManualItem(
  db: DbExecutor,
  listId: string,
  input: CreateManualItem,
): Promise<ShoppingItemRecord> {
  const id = randomUUID();
  const [row] = await db
    .insert(shoppingItem)
    .values({
      id,
      listId,
      itemKey: manualItemKey(id),
      kind: 'manual',
      title: input.title,
      quantity: input.quantity === undefined ? null : String(input.quantity),
      unit: input.unit ?? null,
      aisle: input.aisle ?? null,
    })
    .returning();
  if (!row) {
    throw new Error('insert of a manual item returned nothing');
  }
  return toRecord(row);
}

/** Checks or unchecks a manual item; `undefined` when the list has no such manual item. */
export async function setManualItemCheck(
  db: DbExecutor,
  listId: string,
  itemKey: string,
  check: ItemCheck,
): Promise<ShoppingItemRecord | undefined> {
  const [row] = await db
    .update(shoppingItem)
    .set(check)
    .where(
      and(
        eq(shoppingItem.listId, listId),
        eq(shoppingItem.itemKey, itemKey),
        eq(shoppingItem.kind, 'manual'),
      ),
    )
    .returning();
  return row && toRecord(row);
}

/** Deletes a manual item; `false` when the list has no such manual item. */
export async function deleteManualItem(
  db: DbExecutor,
  listId: string,
  itemKey: string,
): Promise<boolean> {
  const rows = await db
    .delete(shoppingItem)
    .where(
      and(
        eq(shoppingItem.listId, listId),
        eq(shoppingItem.itemKey, itemKey),
        eq(shoppingItem.kind, 'manual'),
      ),
    )
    .returning({ id: shoppingItem.id });
  return rows.length > 0;
}

/** The meals in the list (GLOSSARY: Ястие в списъка), in the order they were added. */
export async function listShoppingMealIds(
  db: DbExecutor,
  listId: string,
): Promise<string[]> {
  const rows = await db
    .select({ mealId: shoppingMeal.mealId })
    .from(shoppingMeal)
    .where(eq(shoppingMeal.listId, listId))
    .orderBy(shoppingMeal.createdAt, shoppingMeal.id);
  return rows.map((row) => row.mealId);
}

/** Adds a meal to the list; a meal already in it stays as it is. */
export async function insertShoppingMeal(
  db: DbExecutor,
  listId: string,
  mealId: string,
): Promise<void> {
  await db
    .insert(shoppingMeal)
    .values({ listId, mealId })
    .onConflictDoNothing();
}

/** Takes a meal out of the list; a meal not in it changes nothing. */
export async function deleteShoppingMeal(
  db: DbExecutor,
  listId: string,
  mealId: string,
): Promise<void> {
  await db
    .delete(shoppingMeal)
    .where(
      and(eq(shoppingMeal.listId, listId), eq(shoppingMeal.mealId, mealId)),
    );
}

/** Takes a meal out of every list it is in, as a change of its recipe does (ADR-0011). */
export async function deleteShoppingMealsOf(
  db: DbExecutor,
  mealId: string,
): Promise<void> {
  await db.delete(shoppingMeal).where(eq(shoppingMeal.mealId, mealId));
}
