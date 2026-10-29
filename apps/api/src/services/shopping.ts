import {
  buildShoppingList,
  type CreateManualItem,
  checkState,
  type MealPlan,
  normalizeItemKey,
  parseItemKey,
  type ShoppingItem,
  type ShoppingList,
} from '@family/shared';
import type { Db, DbExecutor } from '../db/client.js';
import { findPlanByWeek } from '../db/repositories/menu.js';
import { listPantryItems, setPantryRanOut } from '../db/repositories/pantry.js';
import { findRecipe } from '../db/repositories/recipes.js';
import {
  deleteManualItem,
  ensureShoppingList,
  insertManualItem,
  listShoppingItems,
  setComputedItemOverlay,
  setManualItemCheck,
} from '../db/repositories/shopping.js';
import { InvalidActionError, NotFoundError } from './errors.js';
import type { EventBus } from './events.js';

/** What a change to the list needs: the database, and the bus that signals `shopping.changed` after the commit. */
export interface ShoppingDeps {
  db: Db;
  events: EventBus;
}

/** Without a week: the pantry changed, which applies to every list. */
function signal(events: EventBus, weekStart?: string): void {
  events.publish(
    weekStart
      ? { type: 'shopping.changed', weekStart }
      : { type: 'shopping.changed' },
  );
}

/** A week's shopping list as opened by `openList`. */
interface ListWeek {
  weekStart: string;
  /** The week's menu, `null` without one: the list then has only its manual items and the staples that ran out. */
  plan: MealPlan | null;
  listId: string;
}

/** The week's menu and shopping list, the list created on first use and linked to the menu once there is one. */
async function openList(db: DbExecutor, weekStart: string): Promise<ListWeek> {
  const plan = (await findPlanByWeek(db, weekStart)) ?? null;
  return {
    weekStart,
    plan,
    listId: await ensureShoppingList(db, weekStart, plan?.id ?? null),
  };
}

const NO_SUCH_ITEM = 'Няма такъв ред в списъка';

/** Every row of the list, visible, hidden or hidden by the pantry. */
function itemsOf(list: ShoppingList): ShoppingItem[] {
  return [
    ...list.aisles.flatMap((aisle) => aisle.items),
    ...list.hidden,
    ...list.pantryHidden,
  ];
}

/**
 * The row of `key` in the list; an old computed key (`<ingredientId>:<unit>`, e.g. a check queued offline) finds its
 * ingredient's row. An unknown key (e.g. the menu has changed) is a 404.
 */
function findItem(list: ShoppingList, key: string): ShoppingItem {
  const rowKey = normalizeItemKey(key);
  const item = itemsOf(list).find((row) => row.key === rowKey);
  if (!item) {
    throw new NotFoundError(NO_SUCH_ITEM);
  }
  return item;
}

/** The row of `key` in the list as it is now computed. */
async function readItem(
  db: DbExecutor,
  week: ListWeek,
  key: string,
): Promise<ShoppingItem> {
  return findItem(await computeList(db, week), key);
}

/**
 * The list computed from the current menu with the stored checks, hidden items and manual items laid over it, and the
 * pantry: staples hidden by it, staples that ran out shown, use-up items marked.
 */
async function computeList(
  db: DbExecutor,
  { weekStart, plan, listId }: ListWeek,
): Promise<ShoppingList> {
  const recipeIds = new Set(
    (plan?.meals ?? []).flatMap((meal) =>
      meal.recipeId ? [meal.recipeId] : [],
    ),
  );
  const recipes = await Promise.all(
    [...recipeIds].map((id) => findRecipe(db, id)),
  );
  return buildShoppingList({
    weekStart,
    plan,
    recipes: recipes.filter((recipe) => recipe !== undefined),
    items: await listShoppingItems(db, listId),
    pantry: await listPantryItems(db),
  });
}

/**
 * The week's shopping list (GLOSSARY: Списък за пазаруване), computed from its menu on every read; a week without a
 * menu has one too, `hasMenu: false`, with its manual items (#129 D-11).
 */
export async function getShoppingList(
  db: Db,
  weekStart: string,
): Promise<ShoppingList> {
  return computeList(db, await openList(db, weekStart));
}

/**
 * Checks or unchecks a row (GLOSSARY: Отметка) as the acting user at `now`. Checking a row that is already checked
 * keeps the first check, whoever sends it (two people in the shop, #129 D-04); unchecking clears anyone's. A computed key must be in the list as it is now computed. Checking the row of a staple that ran out buys
 * it: `ran_out_at` is cleared in the same transaction and every list is signalled; unchecking does not bring it back.
 */
export async function setItemChecked(
  { db, events }: ShoppingDeps,
  {
    weekStart,
    key,
    checked,
    actingUserId,
    now,
  }: {
    weekStart: string;
    key: string;
    checked: boolean;
    actingUserId: string;
    now: Date;
  },
): Promise<ShoppingItem> {
  const updated = await db.transaction(async (tx) => {
    const week = await openList(tx, weekStart);
    const { listId } = week;
    const item = await readItem(tx, week, key);
    if (checked && item.checkedBy !== null) {
      return { bought: false, item, unchanged: true };
    }
    const check = checkState(checked, actingUserId, now);
    if (item.kind === 'manual') {
      await setManualItemCheck(tx, listId, item.key, check);
    } else {
      await setComputedItemOverlay(tx, listId, item.key, check);
    }
    const bought = checked && item.pantry?.ranOut === true;
    if (bought && item.pantry) {
      await setPantryRanOut(tx, item.pantry.id, null);
    }
    return {
      bought,
      unchanged: false,
      item: {
        ...item,
        ...checkState(checked, actingUserId, now.toISOString()),
        ...(bought &&
          item.pantry && { pantry: { ...item.pantry, ranOut: false } }),
      },
    };
  });
  if (!updated.unchanged) {
    signal(events, updated.bought ? undefined : weekStart);
  }
  return updated.item;
}

/** Hides or shows a computed row (GLOSSARY: Скрит ред); a manual row is deleted instead, so hiding it is a 400. */
export async function setItemHidden(
  { db, events }: ShoppingDeps,
  {
    weekStart,
    key,
    hidden,
  }: { weekStart: string; key: string; hidden: boolean },
): Promise<ShoppingItem> {
  const updated = await db.transaction(async (tx) => {
    const week = await openList(tx, weekStart);
    const { listId } = week;
    if (parseItemKey(key)?.kind === 'manual') {
      throw new InvalidActionError('Ръчен ред не се скрива, а се изтрива');
    }
    const item = await readItem(tx, week, key);
    await setComputedItemOverlay(tx, listId, item.key, { hidden });
    return { ...item, hidden };
  });
  signal(events, weekStart);
  return updated;
}

/** Adds a manual row (GLOSSARY: Ръчен ред), keyed `manual:<id>`, also to a week without a menu (#129 D-11). */
export async function addManualItem(
  { db, events }: ShoppingDeps,
  weekStart: string,
  input: CreateManualItem,
): Promise<ShoppingItem> {
  const item = await db.transaction(async (tx) => {
    const week = await openList(tx, weekStart);
    const record = await insertManualItem(tx, week.listId, input);
    return readItem(tx, week, record.itemKey);
  });
  signal(events, weekStart);
  return item;
}

/** Deletes a manual row; a computed row comes from the menu and is hidden instead, so deleting it is a 400. */
export async function deleteItem(
  { db, events }: ShoppingDeps,
  { weekStart, key }: { weekStart: string; key: string },
): Promise<void> {
  const { listId } = await openList(db, weekStart);
  const parsed = parseItemKey(key);
  if (parsed?.kind === 'computed') {
    throw new InvalidActionError('Ред от менюто не се изтрива, а се скрива');
  }
  if (!parsed || !(await deleteManualItem(db, listId, key))) {
    throw new NotFoundError(NO_SUCH_ITEM);
  }
  signal(events, weekStart);
}
