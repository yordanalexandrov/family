/**
 * Helpers for reading an answer written under strict structured outputs, where every property is required and an
 * optional one is sent as `null`.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The record without the given properties that are `null` (how strict mode says "none") or absent; the rest as is. */
export function withoutNulls(
  record: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(
      ([key, value]) =>
        !(keys.includes(key) && (value === null || value === undefined)),
    ),
  );
}
