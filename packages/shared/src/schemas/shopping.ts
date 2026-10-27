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

/** A meal a computed item comes from: the day, the meal and the recipe's title. */
export const shoppingItemSourceSchema = z.object({
  date: dateKeySchema,
  mealId: z.uuid(),
  recipeTitle: z.string(),
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
 * One line of a shopping list (GLOSSARY: Ред от списъка). A computed item is an ingredient in one unit, keyed
 * `<ingredientId>:<unit>`, with `quantity: null` for a pinch; a manual item is keyed `manual:<id>` and has no sources.
 * `checkedBy`/`checkedAt` are the check (GLOSSARY: Отметка); `hidden` is a hidden item, computed only. `pantry` is
 * there when the ingredient is in the pantry; a staple that ran out and the menu does not want is a computed row
 * without quantity and unit, keyed `<ingredientId>:none`.
 */
export const shoppingItemSchema = z.object({
  key: z.string(),
  kind: shoppingItemKindSchema,
  title: z.string(),
  quantity: quantitySchema,
  unit: unitSchema.nullable(),
  aisle: aisleSchema,
  checkedBy: z.uuid().nullable(),
  checkedAt: instantSchema.nullable(),
  hidden: z.boolean(),
  sources: z.array(shoppingItemSourceSchema),
  pantry: shoppingItemPantrySchema.optional(),
});

export type ShoppingItem = z.infer<typeof shoppingItemSchema>;

/**
 * The shopping list of one weekly menu (GLOSSARY: Списък за пазаруване): the visible items by aisle in walking order
 * (empty aisles left out), the hidden items apart. `pantryHidden` are the rows hidden by the pantry: unchecked rows of
 * a staple that has not run out („🏠 Скрити от килера“), apart from the manually hidden ones. `total` and `remaining`
 * (not checked) count the visible items only.
 */
export const shoppingListSchema = z.object({
  weekStart: weekStartSchema,
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
 * is `<ingredientId>:<unit>`), for a manual item the whole line (`manual:<id>`).
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

/** `/api/shopping-lists/:weekStart…`: the list is addressed by its menu's week. */
export const shoppingListParamsSchema = z.object({
  weekStart: weekStartSchema,
});

/** `…/items/:key`: the item's key as is (`<ingredientId>:<unit>` or `manual:<id>`), URL-encoded by the client. */
export const shoppingItemParamsSchema = shoppingListParamsSchema.extend({
  key: z.string().min(1),
});

/** 404 of `GET /api/shopping-lists/:weekStart` (and its item routes) when the week has no menu: the „Няма меню“ screen. */
export const noPlanSchema = z.object({
  error: z.literal('not_found'),
  code: z.literal('no_plan'),
  message: z.string(),
});

export type NoPlan = z.infer<typeof noPlanSchema>;
