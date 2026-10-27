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
  updatePantryItem,
} from '../db/repositories/pantry.js';
import {
  ConflictError,
  InvalidReferenceError,
  NotFoundError,
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

/** GLOSSARY: Килер. Staples first by name, then use-up items oldest first. */
export function getPantry(db: Db): Promise<PantryItem[]> {
  return listPantryItems(db);
}

/** An unknown ingredient is an `InvalidReferenceError`; one already in the pantry a `ConflictError` `already_in_pantry`. */
export async function addPantryItem(
  { db, events }: PantryDeps,
  { ingredientId, kind, note }: CreatePantryItem,
): Promise<PantryItem> {
  const known = await existingIngredientIds(db, [ingredientId]);
  if (!known.has(ingredientId)) {
    throw new InvalidReferenceError('Няма такъв продукт');
  }
  let id: string;
  try {
    id = await insertPantryItem(db, { ingredientId, kind, note: note ?? null });
  } catch (error) {
    if (isUniqueViolation(error, PANTRY_INGREDIENT_UNIQUE)) {
      throw new ConflictError('Продуктът вече е в килера', {
        code: 'already_in_pantry',
      });
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

/** Changes the kind or the note; an unknown id is a `NotFoundError`. */
export async function changePantryItem(
  { db, events }: PantryDeps,
  id: string,
  changes: UpdatePantryItem,
): Promise<PantryItem> {
  const updated =
    Object.values(changes).every((value) => value === undefined) ||
    (await updatePantryItem(db, id, changes));
  const item = updated ? await findPantryItem(db, id) : undefined;
  if (!item) {
    throw notFound();
  }
  signal(events);
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
