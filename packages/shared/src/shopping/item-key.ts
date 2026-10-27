import { z } from 'zod';
import { type Unit, unitSchema } from '../food/units.js';

/** Units a computed item can have after normalization: kg and l are summed as g and ml. */
const computedUnitSchema = unitSchema.exclude(['kg', 'l']);

const MANUAL_PREFIX = 'manual';

/** The unit part of the key of a computed row without a unit: a staple that ran out and the menu does not want. */
const NO_UNIT = 'none';

/** A shopping item key read back into what it names. */
export type ParsedItemKey =
  | { kind: 'computed'; ingredientId: string; unit: Unit | null }
  | { kind: 'manual'; id: string };

/**
 * The key of a computed item: its ingredient and the unit after normalization (`<ingredientId>:<unit>`). A row
 * without a unit (a staple that ran out and the menu does not want) is `<ingredientId>:none`.
 */
export function computedItemKey(
  ingredientId: string,
  unit: Unit | null,
): string {
  return `${ingredientId}:${unit ?? NO_UNIT}`;
}

/** The key of a manual item (GLOSSARY: Ръчен ред): `manual:<id>` of its `shopping_item` record. */
export function manualItemKey(id: string): string {
  return `${MANUAL_PREFIX}:${id}`;
}

/** What a key names, or `null` for a key that neither function above could have written. */
export function parseItemKey(key: string): ParsedItemKey | null {
  const parts = key.split(':');
  if (parts.length !== 2) {
    return null;
  }
  const [head = '', tail = ''] = parts;
  if (head === MANUAL_PREFIX) {
    return z.uuid().safeParse(tail).success
      ? { kind: 'manual', id: tail }
      : null;
  }
  if (!z.uuid().safeParse(head).success) {
    return null;
  }
  if (tail === NO_UNIT) {
    return { kind: 'computed', ingredientId: head, unit: null };
  }
  const unit = computedUnitSchema.safeParse(tail);
  return unit.success
    ? { kind: 'computed', ingredientId: head, unit: unit.data }
    : null;
}
