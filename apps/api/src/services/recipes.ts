import type {
  Rating,
  Recipe,
  RecipeInput,
  RecipeSummary,
  RecipesQuery,
  ReplaceRecipeInput,
} from '@family/shared';
import type { Db, DbExecutor } from '../db/client.js';
import { existingIngredientIds } from '../db/repositories/ingredients.js';
import {
  findRecipe,
  insertRecipe,
  listRecipes,
  replaceRecipeIngredients,
  setRecipeArchivedAt,
  setRecipeRating,
  updateRecipe,
} from '../db/repositories/recipes.js';
import { existingStepPhotoIds } from '../db/repositories/step-photos.js';
import { InvalidReferenceError, NotFoundError } from './errors.js';
import { acceptRevision } from './recipe-revisions.js';
import { stepPhotoIds } from './step-photos.js';

const NO_SUCH_RECIPE = 'Няма такава рецепта';

/** The registry (GLOSSARY: Регистър рецепти) ordered by title or by rating; archived recipes only with `includeArchived`. */
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

/** Adds a recipe to the registry; an unknown `ingredientId` or step `photoId` is an `InvalidReferenceError`. */
export function createRecipe(db: Db, input: RecipeInput): Promise<Recipe> {
  return db.transaction((tx) => addRecipe(tx, input));
}

/** `createRecipe` inside a transaction the caller owns (e.g. approving a suggestion). */
export async function addRecipe(
  tx: DbExecutor,
  input: RecipeInput,
): Promise<Recipe> {
  await checkReferencesExist(tx, input);
  const id = await insertRecipe(tx, input);
  await replaceRecipeIngredients(tx, id, input.ingredients);
  return getRecipe(tx, id);
}

/**
 * Replaces the whole recipe, its ingredient list included. With `revisionId` the form held that revision (GLOSSARY:
 * Поправка на рецепта), which the save marks `accepted` by `actingUserId`.
 */
export function replaceRecipe(
  db: Db,
  id: string,
  { revisionId, ...input }: ReplaceRecipeInput,
  actingUserId: string,
): Promise<Recipe> {
  return db.transaction(async (tx) => {
    if (revisionId !== undefined) {
      await acceptRevision(tx, revisionId, id, actingUserId);
    }
    await checkReferencesExist(tx, input);
    if (!(await updateRecipe(tx, id, input))) {
      throw new NotFoundError(NO_SUCH_RECIPE);
    }
    await replaceRecipeIngredients(tx, id, input.ingredients);
    return getRecipe(tx, id);
  });
}

/**
 * Archives (`archived = true`) or brings back a recipe; archiving again keeps the first date. One conditional UPDATE
 * in a transaction, so concurrent requests cannot overwrite each other's date.
 */
export function setRecipeArchived(
  db: Db,
  id: string,
  archived: boolean,
): Promise<Recipe> {
  return db.transaction(async (tx) => {
    await setRecipeArchivedAt(tx, id, archived);
    return getRecipe(tx, id);
  });
}

/**
 * GLOSSARY: Оценка. Rates a recipe (`null` takes the rating back); archived recipes too. No change signal: the rating
 * is on the recipe, not on a meal, so the menu has not changed.
 */
export function rateRecipe(
  db: Db,
  id: string,
  rating: Rating | null,
): Promise<Recipe> {
  return db.transaction(async (tx) => {
    if (!(await setRecipeRating(tx, id, rating))) {
      throw new NotFoundError(NO_SUCH_RECIPE);
    }
    return getRecipe(tx, id);
  });
}

async function checkReferencesExist(
  db: DbExecutor,
  input: RecipeInput,
): Promise<void> {
  const ids = [...new Set(input.ingredients.map((line) => line.ingredientId))];
  const existing = await existingIngredientIds(db, ids);
  if (ids.some((id) => !existing.has(id))) {
    throw new InvalidReferenceError('Рецептата сочи непознат продукт');
  }
  const photoIds = stepPhotoIds(input.steps);
  const photos = await existingStepPhotoIds(db, photoIds);
  if (photoIds.some((id) => !photos.has(id))) {
    throw new InvalidReferenceError(
      'Стъпка сочи снимка, която я няма. Добави снимката пак.',
    );
  }
}
