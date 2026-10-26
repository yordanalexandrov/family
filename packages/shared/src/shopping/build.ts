import { AISLES, type Aisle } from '../food/aisles.js';
import { normalizeQuantity, type Unit, unitSchema } from '../food/units.js';
import { totalServings } from '../menu/meal.js';
import type { MealPlan } from '../schemas/menu.js';
import type { Recipe } from '../schemas/recipe.js';
import type {
  ShoppingItem,
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
}

/**
 * The shopping list of a weekly menu (GLOSSARY: Списък за пазаруване): every meal with a recipe and servings adds the
 * recipe's ingredients scaled to its servings, summed per ingredient and unit (kg → g, l → ml) over the week and
 * rounded up; a pinch is one row without a quantity. The stored records add checks, hidden items and manual items.
 */
export function buildShoppingList({
  plan,
  recipes,
  items: records,
}: BuildShoppingListInput): ShoppingList {
  const recipesById = new Map(recipes.map((r) => [r.id, r]));
  const computed = new Map<string, ShoppingItem>();
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
  const overlays = new Map(
    records.filter((r) => r.kind === 'computed').map((r) => [r.itemKey, r]),
  );
  const items: ShoppingItem[] = [
    ...[...computed.values()].map((item) => {
      const overlay = overlays.get(item.key);
      return {
        ...item,
        quantity:
          item.quantity === null || item.unit === null
            ? item.quantity
            : roundUp(item.quantity, item.unit),
        checkedBy: overlay?.checkedBy ?? null,
        checkedAt: overlay?.checkedAt ?? null,
        hidden: overlay?.hidden ?? false,
      };
    }),
    ...records.filter((r) => r.kind === 'manual').map(toManualItem),
  ];
  const visible = items.filter((item) => !item.hidden);
  return {
    weekStart: plan.weekStart,
    aisles: byAisle(visible),
    hidden: byAisle(items.filter((item) => item.hidden)).flatMap(
      ({ items }) => items,
    ),
    total: visible.length,
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
