import { z } from 'zod';
import { type Aisle, aisleSchema } from '../food/aisles.js';
import { quantitySchema, type Unit, unitSchema } from '../food/units.js';
import { dateKeySchema, instantSchema } from './dates.js';
import { weekStartSchema } from './menu.js';
import { pantryKindSchema } from './pantry.js';

export const shoppingItemKindSchema = z.enum(['computed', 'manual']);

export type ShoppingItemKind = z.infer<typeof shoppingItemKindSchema>;

/** Longest title of a manual item ("кафе", "тоалетна хартия"). */
export const MANUAL_ITEM_TITLE_MAX = 60;

/** An amount of a row or a source: a quantity in its unit, `quantity: null` for a pinch. */
export const shoppingAmountSchema = z.object({
  quantity: quantitySchema,
  unit: unitSchema,
});

export type ShoppingAmount = z.infer<typeof shoppingAmountSchema>;

/**
 * A meal a computed item comes from: the day, the meal, the recipe's title and how much the meal wants, scaled to its
 * servings, one amount per unit (`amounts` is absent in a list cached offline before it was sent).
 */
export const shoppingItemSourceSchema = z.object({
  date: dateKeySchema,
  mealId: z.uuid(),
  recipeTitle: z.string(),
  amounts: z.array(shoppingAmountSchema).optional(),
});

export type ShoppingItemSource = z.infer<typeof shoppingItemSourceSchema>;

/**
 * The pantry item (GLOSSARY: Килер) of a computed row's ingredient: `id` is the `pantry_item`, `note` the use-up
 * item's note, `ranOut` a staple someone said ran out („Свърши“) that is not bought yet.
 */
export const shoppingItemPantrySchema = z.object({
  id: z.uuid(),
  kind: pantryKindSchema,
  note: z.string().optional(),
  ranOut: z.boolean(),
});

export type ShoppingItemPantry = z.infer<typeof shoppingItemPantrySchema>;

/**
 * One line of a shopping list (GLOSSARY: Ред от списъка). A computed item is an ingredient, keyed `<ingredientId>`, with
 * `quantity: null` for a pinch; units that do not convert into each other (бр. and г) stay apart: `quantity`/`unit`
 * is the amount in the ingredient's base unit (or the first unit by `unitSchema` order) and `extraAmounts` the other
 * units, absent when there are none („лук 3 бр. + 750 г“). A manual item is keyed `manual:<id>` and has no sources.
 * `checkedBy`/`checkedAt` are the check (GLOSSARY: Отметка); `hidden` is a hidden item, computed only. `pantry` is
 * there when the ingredient is in the pantry; a staple that ran out and the menu does not want is a computed row
 * without quantity and unit. `ingredientId` is the ingredient of a computed row (absent
 * on a manual one, and in a list cached offline before it was sent).
 */
export const shoppingItemSchema = z.object({
  key: z.string(),
  kind: shoppingItemKindSchema,
  ingredientId: z.uuid().optional(),
  title: z.string(),
  quantity: quantitySchema,
  unit: unitSchema.nullable(),
  extraAmounts: z.array(shoppingAmountSchema).optional(),
  aisle: aisleSchema,
  checkedBy: z.uuid().nullable(),
  checkedAt: instantSchema.nullable(),
  hidden: z.boolean(),
  sources: z.array(shoppingItemSourceSchema),
  pantry: shoppingItemPantrySchema.optional(),
});

export type ShoppingItem = z.infer<typeof shoppingItemSchema>;

/**
 * The shopping list of one week (GLOSSARY: Списък за пазаруване): the visible items by aisle in walking order
 * (empty aisles left out), the hidden items apart. `hasMenu: false` is a week without a menu (#129 D-11): no rows computed
 * from a menu, only the manual items and the staples that ran out. `pantryHidden` are the rows hidden by the pantry: unchecked rows of
 * a staple that has not run out („🏠 Скрити от килера“), apart from the manually hidden ones. `total` and `remaining`
 * (not checked) count the visible items only.
 */
export const shoppingListSchema = z.object({
  weekStart: weekStartSchema,
  // A list cached offline before lists without a menu always had one.
  hasMenu: z.boolean().default(true),
  aisles: z.array(
    z.object({ aisle: aisleSchema, items: z.array(shoppingItemSchema) }),
  ),
  hidden: z.array(shoppingItemSchema),
  // A list cached offline before the pantry has none.
  pantryHidden: z.array(shoppingItemSchema).default([]),
  total: z.int().min(0),
  remaining: z.int().min(0),
});

export type ShoppingList = z.infer<typeof shoppingListSchema>;

/**
 * A stored `shopping_item` as `buildShoppingList` reads it: for a computed item only the check and `hidden` (its key
 * is `<ingredientId>`), for a manual item the whole line (`manual:<id>`).
 */
export interface ShoppingItemRecord {
  itemKey: string;
  kind: ShoppingItemKind;
  title: string | null;
  quantity: number | null;
  unit: Unit | null;
  aisle: Aisle | null;
  hidden: boolean;
  checkedBy: string | null;
  /** ISO 8601 instant. */
  checkedAt: string | null;
}

/** `POST /api/shopping-lists/:weekStart/items`: a manual item; the aisle defaults to `other`. */
export const createManualItemSchema = z.object({
  title: z.string().trim().min(1).max(MANUAL_ITEM_TITLE_MAX),
  quantity: z.number().positive().optional(),
  unit: unitSchema.optional(),
  aisle: aisleSchema.optional(),
});

export type CreateManualItem = z.infer<typeof createManualItemSchema>;

/** `PUT …/items/:key/checked`. */
export const setCheckedSchema = z.object({ checked: z.boolean() });

export type SetChecked = z.infer<typeof setCheckedSchema>;

/** `PUT …/items/:key/hidden`. */
export const setHiddenSchema = z.object({ hidden: z.boolean() });

export type SetHidden = z.infer<typeof setHiddenSchema>;

export const shoppingListResponseSchema = z.object({
  list: shoppingListSchema,
});

export const shoppingItemResponseSchema = z.object({
  item: shoppingItemSchema,
});

/** `/api/shopping-lists/:weekStart…`: the list is addressed by its week, with or without a menu. */
export const shoppingListParamsSchema = z.object({
  weekStart: weekStartSchema,
});

/**
 * `…/items/:key`: the item's key as is (`<ingredientId>` or `manual:<id>`), URL-encoded by the client; an old
 * `<ingredientId>:<unit>` is read as `<ingredientId>`.
 */
export const shoppingItemParamsSchema = shoppingListParamsSchema.extend({
  key: z.string().min(1),
});
