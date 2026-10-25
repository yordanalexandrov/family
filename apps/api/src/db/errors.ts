/** Postgres SQLSTATE of a unique index violation. */
const UNIQUE_VIOLATION = '23505';

/**
 * Whether `error` is Postgres refusing a duplicate on the unique index `constraint`.
 * Drizzle wraps the pg error in its own, with the original as `cause`.
 */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    const pgError = current as Error & { code?: unknown; constraint?: unknown };
    if (pgError.code === UNIQUE_VIOLATION) {
      return pgError.constraint === constraint;
    }
  }
  return false;
}
