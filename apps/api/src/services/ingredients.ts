import type {
  CreateIngredient,
  Ingredient,
  IngredientsQuery,
  UpdateIngredient,
} from '@family/shared';
import type { Db } from '../db/client.js';
import { isUniqueViolation } from '../db/errors.js';
import {
  findIngredientByName,
  insertIngredient,
  searchIngredients,
  updateIngredient,
} from '../db/repositories/ingredients.js';
import { ConflictError, NotFoundError } from './errors.js';

/** Enough for an autocomplete list; the client narrows with a longer `q`. */
const SEARCH_LIMIT = 50;

/** Ingredients (GLOSSARY: Продукт) whose name contains `q`, ordered by name, at most 50. */
export function findIngredients(
  db: Db,
  { q }: IngredientsQuery,
): Promise<Ingredient[]> {
  return searchIngredients(db, { q, limit: SEARCH_LIMIT });
}

/** `input.name` is canonical already (`createIngredientSchema` normalizes it); a taken name is a `ConflictError`. */
export async function createIngredient(
  db: Db,
  input: CreateIngredient,
): Promise<Ingredient> {
  try {
    return await insertIngredient(db, input);
  } catch (error) {
    throw await conflictOrRethrow(db, error, input.name);
  }
}

/** Fixes the name, aisle or unit; an unknown id is a `NotFoundError`, a taken name a `ConflictError`. */
export async function changeIngredient(
  db: Db,
  id: string,
  changes: UpdateIngredient,
): Promise<Ingredient> {
  let updated: Ingredient | undefined;
  try {
    updated = await updateIngredient(db, id, changes);
  } catch (error) {
    // Only a new name can clash with the unique index.
    throw changes.name === undefined
      ? error
      : await conflictOrRethrow(db, error, changes.name);
  }
  if (!updated) {
    throw new NotFoundError('Няма такъв продукт');
  }
  return updated;
}

/** A duplicate name becomes a `ConflictError` carrying the existing ingredient; anything else is passed on. */
async function conflictOrRethrow(
  db: Db,
  error: unknown,
  name: string,
): Promise<unknown> {
  if (!isUniqueViolation(error, 'ingredient_name_key')) {
    return error;
  }
  const existing = await findIngredientByName(db, name);
  return new ConflictError(`Вече има продукт „${name}“`, {
    ingredient: existing,
  });
}
