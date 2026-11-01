import {
  type Aisle,
  aisleSchema,
  type ShoppingItemKind,
  shoppingItemKindSchema,
  type Unit,
  unitSchema,
} from '@family/shared';
import {
  boolean,
  check,
  date,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { oneOf } from './checks.js';
import { createdAt } from './columns.js';
import { meal, mealPlan } from './menu.js';
import { user } from './user.js';

/**
 * GLOSSARY: Списък за пазаруване. One per week, with or without a menu (#129 D-11), created on its first use; the items
 * are computed from the week's menu on every read, so only the overlay in `shopping_item` is stored. `plan_id` is the
 * week's menu once there is one; a deleted menu leaves the list and its manual items.
 */
export const shoppingList = pgTable('shopping_list', {
  id: uuid('id').primaryKey().defaultRandom(),
  weekStart: date('week_start', { mode: 'string' }).notNull().unique(),
  planId: uuid('plan_id')
    .unique()
    .references(() => mealPlan.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
});

/**
 * GLOSSARY: Ред от списъка, the stored part. A `computed` record (`item_key` `<ingredientId>`) holds only a
 * check or `hidden` and exists only while it holds one; a `manual` record (`manual:<id>`) is the whole manual item
 * with its title, optional quantity, unit and aisle.
 */
export const shoppingItem = pgTable(
  'shopping_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    listId: uuid('list_id')
      .notNull()
      .references(() => shoppingList.id, { onDelete: 'cascade' }),
    itemKey: text('item_key').notNull(),
    kind: text('kind').$type<ShoppingItemKind>().notNull(),
    title: text('title'),
    quantity: numeric('quantity'),
    unit: text('unit').$type<Unit>(),
    aisle: text('aisle').$type<Aisle>(),
    hidden: boolean('hidden').notNull().default(false),
    checkedBy: uuid('checked_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    checkedAt: timestamp('checked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('shopping_item_list_key').on(t.listId, t.itemKey),
    check(
      'shopping_item_kind_check',
      oneOf(t.kind, shoppingItemKindSchema.options),
    ),
    check('shopping_item_unit_check', oneOf(t.unit, unitSchema.options)),
    check('shopping_item_aisle_check', oneOf(t.aisle, aisleSchema.options)),
  ],
);

/**
 * GLOSSARY: Ястие в списъка. A meal of the week's menu someone added to the list; only these meals are summed
 * (ADR-0011). The choice is the list's, not the meal's: the menu knows nothing of shopping. A deleted meal (or menu)
 * leaves the list with its row.
 */
export const shoppingMeal = pgTable(
  'shopping_meal',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    listId: uuid('list_id')
      .notNull()
      .references(() => shoppingList.id, { onDelete: 'cascade' }),
    mealId: uuid('meal_id')
      .notNull()
      .references(() => meal.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('shopping_meal_list_meal').on(t.listId, t.mealId)],
);
