import {
  char,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const userRole = pgEnum('user_role', ['parent']);

/** A member of the family (GLOSSARY: Потребител). `color` names a design token (e.g. `person-1`), not a CSS value. */
export const user = pgTable('user', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  role: userRole('role').notNull(),
  initial: char('initial', { length: 1 }).notNull(),
  color: text('color').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
