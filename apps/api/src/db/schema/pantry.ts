import { type PantryKind, pantryKindSchema } from '@family/shared';
import { sql } from 'drizzle-orm';
import { check, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { oneOf } from './checks.js';
import { createdAt } from './columns.js';
import { ingredient } from './food.js';

/**
 * GLOSSARY: Килер. At most one row per ingredient, without a quantity: a staple (Постоянен продукт) or a use-up item
 * (Временен продукт). `ran_out_at` is set only on a staple someone said ran out, until it is bought.
 */
export const pantryItem = pgTable(
  'pantry_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ingredientId: uuid('ingredient_id')
      .notNull()
      .unique()
      .references(() => ingredient.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<PantryKind>().notNull(),
    note: text('note'),
    ranOutAt: timestamp('ran_out_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check('pantry_item_kind_check', oneOf(t.kind, pantryKindSchema.options)),
    check(
      'pantry_item_ran_out_check',
      sql`${t.ranOutAt} is null or ${t.kind} = 'staple'`,
    ),
  ],
);
