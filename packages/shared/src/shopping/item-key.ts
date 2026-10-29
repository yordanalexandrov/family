import { z } from 'zod';
import { unitSchema } from '../food/units.js';

/** Units an old computed key could have after normalization: kg and l were summed as g and ml. */
const computedUnitSchema = unitSchema.exclude(['kg', 'l']);

const MANUAL_PREFIX = 'manual';

/** The unit part of an old key of a computed row without a unit (a staple that ran out and the menu does not want). */
const NO_UNIT = 'none';

/** A shopping item key read back into what it names. */
export type ParsedItemKey =
  | { kind: 'computed'; ingredientId: string }
  | { kind: 'manual'; id: string };

/**
 * The key of a computed item: its ingredient (`<ingredientId>`), one row in every unit. Keys written before the row
 * was per ingredient (`<ingredientId>:<unit>`, `<ingredientId>:none`) are still read, see {@link normalizeItemKey}.
 */
export function computedItemKey(ingredientId: string): string {
  return ingredientId;
}

/** The key of a manual item (GLOSSARY: Ръчен ред): `manual:<id>` of its `shopping_item` record. */
export function manualItemKey(id: string): string {
  return `${MANUAL_PREFIX}:${id}`;
}

/** What a key names, or `null` for a key that neither function above, nor an old computed key, could have written. */
export function parseItemKey(key: string): ParsedItemKey | null {
  const [head = '', tail, ...rest] = key.split(':');
  if (rest.length > 0) {
    return null;
  }
  if (head === MANUAL_PREFIX) {
    return tail !== undefined && z.uuid().safeParse(tail).success
      ? { kind: 'manual', id: tail }
      : null;
  }
  if (!z.uuid().safeParse(head).success) {
    return null;
  }
  const oldUnit =
    tail === undefined ||
    tail === NO_UNIT ||
    computedUnitSchema.safeParse(tail).success;
  return oldUnit ? { kind: 'computed', ingredientId: head } : null;
}

/**
 * The key a row has today: an old computed key (`<ingredientId>:<unit>`) becomes its ingredient's row; any other key
 * is returned as is. A check or hide queued offline under an old key lands on the row it meant.
 */
export function normalizeItemKey(key: string): string {
  const parsed = parseItemKey(key);
  return parsed?.kind === 'computed'
    ? computedItemKey(parsed.ingredientId)
    : key;
}
