import { randomUUID } from 'node:crypto';
import {
  type CreateManualItem,
  manualItemKey,
  type ShoppingItemRecord,
} from '@family/shared';
import { and, eq } from 'drizzle-orm';
import type { DbExecutor } from '../client.js';
import { shoppingItem, shoppingList } from '../schema/shopping.js';

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

/** The id of the plan's shopping list, created on the first call; safe to call concurrently. */
export async function ensureShoppingList(
  db: DbExecutor,
  planId: string,
): Promise<string> {
  await db.insert(shoppingList).values({ planId }).onConflictDoNothing();
  const [row] = await db
    .select({ id: shoppingList.id })
    .from(shoppingList)
    .where(eq(shoppingList.planId, planId))
    .limit(1);
  if (!row) {
    throw new Error(`shopping list of plan ${planId} vanished`);
  }
  return row.id;
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

export async function findShoppingItem(
  db: DbExecutor,
  listId: string,
  itemKey: string,
): Promise<ShoppingItemRecord | undefined> {
  const [row] = await db
    .select()
    .from(shoppingItem)
    .where(
      and(eq(shoppingItem.listId, listId), eq(shoppingItem.itemKey, itemKey)),
    )
    .limit(1);
  return row && toRecord(row);
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
