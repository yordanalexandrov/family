import { type SQL, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

// Enums are `text` with a `check` against the values in @family/shared, not Postgres enums,
// so adding a value is a plain constraint swap in a migration. `$type` gives the columns the shared types.

/** `'a', 'b', …` for `in (…)` and `array[…]`; values are fixed identifiers from shared, never user input. */
export function literals(values: readonly string[]): SQL {
  return sql.raw(values.map((value) => `'${value}'`).join(', '));
}

/** `column in ('a', 'b', …)` for a `check`. */
export function oneOf(column: AnyPgColumn, values: readonly string[]): SQL {
  return sql`${column} in (${literals(values)})`;
}
