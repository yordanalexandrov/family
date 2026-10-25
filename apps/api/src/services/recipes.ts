import type {
  Recipe,
  RecipeInput,
  RecipeSummary,
  RecipesQuery,
} from '@family/shared';
import type { Db, DbExecutor } from '../db/client.js';
import { existingIngredientIds } from '../db/repositories/ingredients.js';
import {
  findRecipe,
  insertRecipe,
  listRecipes,
  replaceRecipeIngredients,
  setRecipeArchivedAt,
  updateRecipe,
} from '../db/repositories/recipes.js';
import { InvalidReferenceError, NotFoundError } from './errors.js';

const NO_SUCH_RECIPE = 'Няма такава рецепта';

/** The registry (GLOSSARY: Регистър рецепти) ordered by title; archived recipes only with `includeArchived`. */
export function findRecipes(
  db: Db,
  query: RecipesQuery,
): Promise<RecipeSummary[]> {
  return listRecipes(db, query);
}

/** One recipe with its ingredient lines; an unknown id is a `NotFoundError`. */
export async function getRecipe(db: DbExecutor, id: string): Promise<Recipe> {
  const found = await findRecipe(db, id);
  if (!found) {
    throw new NotFoundError(NO_SUCH_RECIPE);
  }
  return found;
}

/** Adds a recipe to the registry; an unknown `ingredientId` is an `InvalidReferenceError`. */
export function createRecipe(db: Db, input: RecipeInput): Promise<Recipe> {
  return db.transaction((tx) => addRecipe(tx, input));
}

/** `createRecipe` inside a transaction the caller owns (e.g. approving a suggestion). */
export async function addRecipe(
  tx: DbExecutor,
  input: RecipeInput,
): Promise<Recipe> {
  await checkIngredientsExist(tx, input);
  const id = await insertRecipe(tx, input);
  await replaceRecipeIngredients(tx, id, input.ingredients);
  return getRecipe(tx, id);
}

/** Replaces the whole recipe, its ingredient list included. */
export function replaceRecipe(
  db: Db,
  id: string,
  input: RecipeInput,
): Promise<Recipe> {
  return db.transaction(async (tx) => {
    await checkIngredientsExist(tx, input);
    if (!(await updateRecipe(tx, id, input))) {
      throw new NotFoundError(NO_SUCH_RECIPE);
    }
    await replaceRecipeIngredients(tx, id, input.ingredients);
    return getRecipe(tx, id);
  });
}

/** Archives (`archived = true`) or brings back a recipe; archiving again keeps the first date. */
export async function setRecipeArchived(
  db: Db,
  id: string,
  archived: boolean,
): Promise<Recipe> {
  const current = await getRecipe(db, id);
  if ((current.archivedAt !== null) === archived) {
    return current;
  }
  await setRecipeArchivedAt(db, id, archived ? new Date() : null);
  return getRecipe(db, id);
}

async function checkIngredientsExist(
  db: DbExecutor,
  input: RecipeInput,
): Promise<void> {
  const ids = [...new Set(input.ingredients.map((line) => line.ingredientId))];
  const existing = await existingIngredientIds(db, ids);
  if (ids.some((id) => !existing.has(id))) {
    throw new InvalidReferenceError('Рецептата сочи непознат продукт');
  }
}
