import { timestamp } from 'drizzle-orm/pg-core';

/** When the row was written, by the database clock. */
export const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
