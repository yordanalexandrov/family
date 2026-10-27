import { AISLES, type Aisle } from '../food/aisles.js';
import { normalizeQuantity, type Unit, unitSchema } from '../food/units.js';
import { totalServings } from '../menu/meal.js';
import type { MealPlan } from '../schemas/menu.js';
import type { PantryItem } from '../schemas/pantry.js';
import type { Recipe } from '../schemas/recipe.js';
import type {
  ShoppingItem,
  ShoppingItemPantry,
  ShoppingItemRecord,
  ShoppingList,
} from '../schemas/shopping.js';
import { computedItemKey } from './item-key.js';

export interface BuildShoppingListInput {
  plan: MealPlan;
  /** The recipes of the plan's meals, with their ingredients. A meal whose recipe is missing adds nothing. */
  recipes: Recipe[];
  /** The stored `shopping_item` records of the plan's list. */
  items: ShoppingItemRecord[];
  /** The pantry (GLOSSARY: Килер); without it no row is hidden by the pantry. */
  pantry?: PantryItem[];
}

/**
 * The shopping list of a weekly menu (GLOSSARY: Списък за пазаруване): every meal with a recipe and servings adds the
 * recipe's ingredients scaled to its servings, summed per ingredient and unit (kg → g, l → ml) over the week and
 * rounded up; a pinch is one row without a quantity. The stored records add checks, hidden items and manual items.
 *
 * The pantry: a row of a staple is hidden by the pantry (`pantryHidden`) unless it ran out or is checked; a staple
 * that ran out and the menu does not want gets a row without a quantity, kept while it is checked. A staple that ran
 * out is visible in every list, also where its row is hidden by hand. A check from before the staple ran out does not
 * count. A row of a use-up item stays as it is, marked with the note.
 */
export function buildShoppingList({
  plan,
  recipes,
  items: records,
  pantry = [],
}: BuildShoppingListInput): ShoppingList {
  const recipesById = new Map(recipes.map((r) => [r.id, r]));
  const computed = new Map<string, ShoppingItem & { ingredientId: string }>();
  const notInMenu = new Set<string>();
  const meals = [...plan.meals].sort((a, b) => a.date.localeCompare(b.date));
  for (const meal of meals) {
    const recipe = meal.recipeId ? recipesById.get(meal.recipeId) : undefined;
    const servings = totalServings(meal.servings);
    if (!recipe || servings <= 0) {
      continue;
    }
    const factor = servings / recipe.servings;
    for (const line of recipe.ingredients) {
      const { quantity, unit } = normalizeQuantity(line.quantity, line.unit);
      const key = computedItemKey(line.ingredientId, unit);
      const item = computed.get(key) ?? {
        key,
        kind: 'computed',
        ingredientId: line.ingredientId,
        title: line.ingredient.name,
        quantity: null,
        unit,
        aisle: line.ingredient.aisle,
        checkedBy: null,
        checkedAt: null,
        hidden: false,
        sources: [],
      };
      if (quantity !== null) {
        item.quantity = (item.quantity ?? 0) + quantity * factor;
      }
      if (!item.sources.some((source) => source.mealId === meal.id)) {
        item.sources.push({
          date: meal.date,
          mealId: meal.id,
          recipeTitle: recipe.title,
        });
      }
      computed.set(key, item);
    }
  }
  const pantryByIngredient = new Map(
    pantry.map((entry) => [entry.ingredient.id, entry]),
  );
  const wanted = new Set(
    [...computed.values()].map((item) => item.ingredientId),
  );
  for (const entry of pantry) {
    if (entry.kind !== 'staple' || wanted.has(entry.ingredient.id)) {
      continue;
    }
    const key = computedItemKey(entry.ingredient.id, null);
    computed.set(key, {
      key,
      kind: 'computed',
      ingredientId: entry.ingredient.id,
      title: entry.ingredient.name,
      quantity: null,
      unit: null,
      aisle: entry.ingredient.aisle,
      checkedBy: null,
      checkedAt: null,
      hidden: false,
      sources: [],
    });
    notInMenu.add(key);
  }
  const overlays = new Map(
    records.filter((r) => r.kind === 'computed').map((r) => [r.itemKey, r]),
  );
  const computedItems = [...computed.values()].flatMap((item) => {
    const overlay = overlays.get(item.key);
    const entry = pantryByIngredient.get(item.ingredientId);
    const ranOutAt = entry?.kind === 'staple' ? entry.ranOutAt : null;
    // A check from before the staple ran out was of the last purchase.
    const counts =
      overlay?.checkedAt != null &&
      (ranOutAt === null || overlay.checkedAt >= ranOutAt);
    const row: ShoppingItem = {
      ...item,
      quantity:
        item.quantity === null || item.unit === null
          ? item.quantity
          : roundUp(item.quantity, item.unit),
      checkedBy: counts ? (overlay?.checkedBy ?? null) : null,
      checkedAt: counts ? (overlay?.checkedAt ?? null) : null,
      // Every list shows a staple that ran out, so a hand-hidden row of it is visible until it is bought.
      hidden: (overlay?.hidden ?? false) && ranOutAt === null,
      ...(entry && { pantry: pantryOf(entry) }),
    };
    // The row of a staple the menu does not want lives only while it ran out or is checked.
    return notInMenu.has(item.key) && ranOutAt === null && !counts ? [] : [row];
  });
  const byPantry = (item: ShoppingItem) =>
    !item.hidden &&
    item.pantry?.kind === 'staple' &&
    !item.pantry.ranOut &&
    item.checkedBy === null;
  const items: ShoppingItem[] = [
    ...computedItems,
    ...records.filter((r) => r.kind === 'manual').map(toManualItem),
  ];
  const visible = items.filter((item) => !item.hidden && !byPantry(item));
  const flat = (rows: ShoppingItem[]) =>
    byAisle(rows).flatMap(({ items }) => items);
  return {
    weekStart: plan.weekStart,
    aisles: byAisle(visible),
    hidden: flat(items.filter((item) => item.hidden)),
    pantryHidden: flat(items.filter(byPantry)),
    total: visible.length,
    remaining: visible.filter((item) => item.checkedBy === null).length,
  };
}

/** What a row shows of its ingredient's pantry item; only a staple runs out. */
function pantryOf(entry: PantryItem): ShoppingItemPantry {
  return {
    id: entry.id,
    kind: entry.kind,
    ...(entry.note !== null && { note: entry.note }),
    ranOut: entry.kind === 'staple' && entry.ranOutAt !== null,
  };
}

/**
 * A check (GLOSSARY: Отметка) as an item's `checkedBy`/`checkedAt`: who and when for a checked item, both `null` for
 * an unchecked one. `at` is an ISO string in the list and a `Date` in the database.
 */
export function checkState<At>(
  checked: boolean,
  by: string | null,
  at: At,
): { checkedBy: string | null; checkedAt: At | null } {
  return checked
    ? { checkedBy: by, checkedAt: at }
    : { checkedBy: null, checkedAt: null };
}

/**
 * The list with one item checked (`checkedBy` set) or unchecked (`null`), ordered as `buildShoppingList` orders it:
 * the item moves to the end of its aisle or back, `remaining` is recounted. An unknown key leaves the list as is.
 * The PWA applies an offline check with it before the api has seen it.
 */
export function withCheck(
  list: ShoppingList,
  key: string,
  check: Pick<ShoppingItem, 'checkedBy' | 'checkedAt'>,
): ShoppingList {
  const apply = (item: ShoppingItem) =>
    item.key === key ? { ...item, ...check } : item;
  const visible = list.aisles.flatMap(({ items }) => items).map(apply);
  return {
    ...list,
    aisles: byAisle(visible),
    hidden: list.hidden.map(apply),
    remaining: visible.filter((item) => item.checkedBy === null).length,
  };
}

/** A manual item (GLOSSARY: Ръчен ред) as written; without an aisle it is in `other`. */
function toManualItem(record: ShoppingItemRecord): ShoppingItem {
  return {
    key: record.itemKey,
    kind: 'manual',
    title: record.title ?? '',
    quantity: record.quantity,
    unit: record.unit,
    aisle: record.aisle ?? 'other',
    checkedBy: record.checkedBy,
    checkedAt: record.checkedAt,
    hidden: false,
    sources: [],
  };
}

/** The step a week total is rounded up to: tens of g and ml, whole pieces and spoons. */
const ROUNDING_STEP: Partial<Record<Unit, number>> = { g: 10, ml: 10 };

/** Rounds up to the unit's step; the tolerance keeps float noise (300.00000000000006 g) from adding a step. */
function roundUp(quantity: number, unit: Unit): number {
  const step = ROUNDING_STEP[unit] ?? 1;
  return Math.ceil(quantity / step - 1e-9) * step;
}

const UNIT_ORDER = unitSchema.options;

/**
 * Checked items last, then title in Bulgarian alphabetical order; rows of one ingredient stay together, ordered by
 * unit.
 */
function compareItems(a: ShoppingItem, b: ShoppingItem): number {
  return (
    Number(a.checkedBy !== null) - Number(b.checkedBy !== null) ||
    a.title.localeCompare(b.title, 'bg') ||
    unitRank(a.unit) - unitRank(b.unit) ||
    a.key.localeCompare(b.key)
  );
}

function unitRank(unit: Unit | null): number {
  return unit === null ? UNIT_ORDER.length : UNIT_ORDER.indexOf(unit);
}

/** The items by aisle in walking order (`AISLES.order`), without empty aisles. */
function byAisle(items: ShoppingItem[]): ShoppingList['aisles'] {
  const aisles = [...AISLES].sort((a, b) => a.order - b.order);
  return aisles
    .map(({ key }) => ({
      aisle: key as Aisle,
      items: items.filter((item) => item.aisle === key).sort(compareItems),
    }))
    .filter(({ items }) => items.length > 0);
}
