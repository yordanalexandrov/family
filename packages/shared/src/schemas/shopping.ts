import { z } from 'zod';
import { aisleSchema } from '../food/aisles.js';
import { quantitySchema, unitSchema } from '../food/units.js';
import { dateKeySchema, instantSchema } from './dates.js';
import { weekStartSchema } from './menu.js';

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
 * One line of a shopping list (GLOSSARY: Ред от списъка). A computed item is an ingredient in one unit, keyed
 * `<ingredientId>:<unit>`, with `quantity: null` for a pinch; a manual item is keyed `manual:<id>` and has no sources.
 * `checkedBy`/`checkedAt` are the check (GLOSSARY: Отметка); `hidden` is a hidden item, computed only.
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
});

export type ShoppingItem = z.infer<typeof shoppingItemSchema>;

/**
 * The shopping list of one weekly menu (GLOSSARY: Списък за пазаруване): the visible items by aisle in walking order
 * (empty aisles left out), the hidden items apart. `total` and `remaining` (not checked) count the visible items only.
 */
export const shoppingListSchema = z.object({
  weekStart: weekStartSchema,
  aisles: z.array(
    z.object({ aisle: aisleSchema, items: z.array(shoppingItemSchema) }),
  ),
  hidden: z.array(shoppingItemSchema),
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
  unit: z.infer<typeof unitSchema> | null;
  aisle: z.infer<typeof aisleSchema> | null;
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
