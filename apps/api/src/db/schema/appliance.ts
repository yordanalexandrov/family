import { sql } from 'drizzle-orm';
import { boolean, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt } from './columns.js';

/**
 * GLOSSARY: Уред. The household's special appliances, in the order they were added; only the enabled ones reach
 * `recipe.suggest`. The first ones come from the data migration `0023_seed_appliances`. A name is there once, in any case.
 */
export const appliance = pgTable(
  'appliance',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('appliance_name_unique').on(sql`lower(${t.name})`)],
);
