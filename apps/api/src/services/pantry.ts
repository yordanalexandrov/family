import type {
  CreatePantryItem,
  PantryItem,
  UpdatePantryItem,
} from '@family/shared';
import type { Db } from '../db/client.js';
import { isUniqueViolation } from '../db/errors.js';
import { existingIngredientIds } from '../db/repositories/ingredients.js';
import {
  deletePantryItem,
  findPantryItem,
  insertPantryItem,
  listPantryItems,
  PANTRY_INGREDIENT_UNIQUE,
  setPantryRanOut,
  updatePantryItem,
} from '../db/repositories/pantry.js';
import {
  type ConflictError,
  InvalidReferenceError,
  NotFoundError,
  refuse,
} from './errors.js';
import type { EventBus } from './events.js';

/** What a change to the pantry needs: the database, and the bus that signals `shopping.changed` after the commit. */
export interface PantryDeps {
  db: Db;
  events: EventBus;
}

/** The pantry applies to every week's shopping list, so the signal names no week. */
function signal(events: EventBus): void {
  events.publish({ type: 'shopping.changed' });
}

function notFound(): NotFoundError {
  return new NotFoundError('Няма такъв продукт в килера');
}

function notStaple(): ConflictError {
  return refuse('not_staple', 'Свършва само постоянен продукт');
}

/** GLOSSARY: Килер. Staples first by name, then use-up items oldest first. */
export function getPantry(db: Db): Promise<PantryItem[]> {
  return listPantryItems(db);
}

/** An unknown ingredient is an `InvalidReferenceError`; one already in the pantry a `ConflictError` `already_in_pantry`. */
export async function addPantryItem(
  { db, events }: PantryDeps,
  { ingredientId, kind, note, frozen }: CreatePantryItem,
): Promise<PantryItem> {
  const known = await existingIngredientIds(db, [ingredientId]);
  if (!known.has(ingredientId)) {
    throw new InvalidReferenceError('Няма такъв продукт');
  }
  let id: string;
  try {
    id = await insertPantryItem(db, {
      ingredientId,
      kind,
      note: note ?? null,
      frozen,
    });
  } catch (error) {
    if (isUniqueViolation(error, PANTRY_INGREDIENT_UNIQUE)) {
      throw refuse('already_in_pantry', 'Продуктът вече е в килера');
    }
    throw error;
  }
  const item = await findPantryItem(db, id);
  if (!item) {
    throw notFound();
  }
  signal(events);
  return item;
}

/** Changes the kind, the note or „Във фризера“; an unknown id is a `NotFoundError`. An empty change answers the item and signals nothing. */
export async function changePantryItem(
  { db, events }: PantryDeps,
  id: string,
  changes: UpdatePantryItem,
): Promise<PantryItem> {
  const empty = Object.values(changes).every((value) => value === undefined);
  const updated = empty || (await updatePantryItem(db, id, changes));
  const item = updated ? await findPantryItem(db, id) : undefined;
  if (!item) {
    throw notFound();
  }
  if (!empty) {
    signal(events);
  }
  return item;
}

/** „Използвано“, or taking a staple out; an unknown id is a `NotFoundError`. */
export async function removePantryItem(
  { db, events }: PantryDeps,
  id: string,
): Promise<void> {
  if (!(await deletePantryItem(db, id))) {
    throw notFound();
  }
  signal(events);
}

/**
 * „Свърши“: the staple ran out at `now`, so every shopping list shows it until it is bought. An unknown id is a
 * `NotFoundError`; a use-up item does not run out, a `ConflictError` `not_staple`.
 */
export async function markPantryRanOut(
  { db, events }: PantryDeps,
  id: string,
  now: Date,
): Promise<PantryItem> {
  const found = await findPantryItem(db, id);
  if (!found) {
    throw notFound();
  }
  if (found.kind !== 'staple') {
    throw notStaple();
  }
  if (!(await setPantryRanOut(db, id, now))) {
    // Taken out of the pantry, or turned into a use-up item, between the read and the write.
    throw (await findPantryItem(db, id)) ? notStaple() : notFound();
  }
  signal(events);
  return { ...found, ranOutAt: now.toISOString() };
}
