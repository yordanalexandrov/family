import type {
  Recipe,
  RecipeReviseInput,
  RecipeReviseOutput,
  RecipeRevisionRequest,
  RevisionLine,
} from '@family/shared';
import type { Db, DbExecutor } from '../db/client.js';
import {
  findIngredientsByIds,
  listRegistryIngredients,
} from '../db/repositories/ingredients.js';
import {
  decideRevisionRequest,
  findOpenRevisions,
  findRevisionRequest,
  insertRevisionRequest,
  lockRecipeUpdatedAt,
  lockRevisionRequest,
  setRevision,
  setRevisionNoResults,
} from '../db/repositories/recipe-revisions.js';
import { findRecipe } from '../db/repositories/recipes.js';
import { recipeRevisionRequest } from '../db/schema/food.js';
import { contractRecipe, photosByRef } from './contract-recipe.js';
import type {
  ContractRequestHandle,
  ContractRequestStore,
} from './contract-requests.js';
import { ConflictError, NotFoundError, refuse } from './errors.js';

const NO_SUCH_RECIPE = 'Няма такава рецепта';
const NO_SUCH_REVISION = 'Няма такава поправка на рецепта';
const ALREADY_DECIDED = 'Поправката вече е приета или отхвърлена';
const NOT_READY = 'Поправката още не е готова';
const REVISION_OPEN = 'Поправка чака преглед';

/** What „✏️ Поправи с AI“ asks: the recipe and the instruction. */
export interface RevisionParams {
  recipeId: string;
  instruction: string;
}

/**
 * „✏️ Поправи с AI“ (GLOSSARY: Поправка на рецепта): `recipe.revise` as AI requests, registered in `buildApp()` as
 * `app.recipeRevisions`. Works without an acting user (the kiosk).
 */
export type RecipeRevisions = ContractRequestHandle<
  RevisionParams,
  RecipeRevisionRequest,
  string | null
>;

/** What the run read when it started: the recipe and its photos by reference. */
interface Loaded {
  recipe: Recipe;
  /** The photo of each step that has one, by its reference `e1`, `e2`, … in the input. */
  ownPhotos: Map<string, string>;
}

/**
 * How `recipe.revise` requests are stored: refused for an unknown recipe and while the recipe has an open revision; the request remembers when the recipe was
 * saved. The run reads the recipe as it is saved and the whole registry; a valid answer is stored with the recipe's
 * own photos back on their steps by id, each line with its registry product as it is now (or the proposed new one), and
 * how many photos of the recipe no step keeps. The recipe itself is not changed.
 */
export function createRecipeRevisionStore(): ContractRequestStore<
  RevisionParams,
  RecipeRevisionRequest,
  RecipeReviseInput,
  RecipeReviseOutput,
  string | null,
  Loaded,
  Loaded
> {
  return {
    table: recipeRevisionRequest,

    async insert(tx, { recipeId, instruction }, requestedBy) {
      const baseUpdatedAt = await lockRecipeUpdatedAt(tx, recipeId);
      if (!baseUpdatedAt) {
        throw new NotFoundError(NO_SUCH_RECIPE);
      }
      // The recipe's row is held, so a second request waits here and sees this one.
      const open = (await findOpenRevisions(tx, [recipeId])).get(recipeId);
      if (open) {
        throw refuse('revision_open', REVISION_OPEN, { revisionId: open.id });
      }
      return insertRevisionRequest(tx, {
        recipeId,
        instruction,
        requestedBy,
        baseUpdatedAt,
      });
    },

    find: findRevisionRequest,

    async load(db, request) {
      const recipe = await findRecipe(db, request.recipeId);
      if (!recipe) {
        throw new Error('recipe of a revision request vanished');
      }
      return { recipe, ownPhotos: photosByRef(recipe) };
    },

    async buildInput(db, request, { recipe, ownPhotos }) {
      return {
        recipe: contractRecipe(recipe, ownPhotos),
        instruction: request.instruction,
        // The cooking changes come with the cooking feedback (#303).
        cookingChanges: [],
        ingredients: await listRegistryIngredients(db),
      };
    },

    async prepare(_output, loaded) {
      return loaded;
    },

    async onDone(tx, request, output, loaded) {
      const revised = output.recipe;
      if (!revised || !loaded) {
        return;
      }
      const linked = new Map(
        (
          await findIngredientsByIds(tx, [
            ...new Set(
              revised.ingredients.flatMap((line) =>
                line.ingredientId === null ? [] : [line.ingredientId],
              ),
            ),
          ])
        ).map((ingredient) => [ingredient.id, ingredient]),
      );
      const ingredients = revised.ingredients.map((line): RevisionLine => {
        const ingredient =
          line.ingredientId === null
            ? undefined
            : linked.get(line.ingredientId);
        if (line.ingredientId !== null && !ingredient) {
          throw new Error(`ingredient ${line.ingredientId} vanished`);
        }
        return {
          ...(ingredient ? { ingredient } : {}),
          ...(line.newProduct ? { newProduct: line.newProduct } : {}),
          quantity: line.quantity,
          unit: line.unit,
          ...(line.note === null ? {} : { note: line.note }),
        };
      });
      const kept = new Set(revised.steps.map((step) => step.image));
      await setRevision(tx, request.id, {
        changes: revised.changes,
        servings: revised.servings,
        ...(revised.prepMinutes === null
          ? {}
          : { prepMinutes: revised.prepMinutes }),
        ingredients,
        steps: revised.steps.map((step) => {
          const photoId =
            step.image === null ? undefined : loaded.ownPhotos.get(step.image);
          return photoId ? { text: step.text, photoId } : { text: step.text };
        }),
        preparation: revised.preparation,
        droppedPhotos: [...loaded.ownPhotos.keys()].filter(
          (ref) => !kept.has(ref),
        ).length,
      });
    },

    noResults(output) {
      return output.noResults;
    },

    async onNoResults(tx, request, reason) {
      await setRevisionNoResults(tx, request.id, reason);
    },
  };
}

/** „Отхвърли“: 404 for an unknown revision, 409 for one already decided. */
export function rejectRevision(
  db: Db,
  id: string,
  decidedBy: string | null,
): Promise<RecipeRevisionRequest> {
  return db.transaction(async (tx) => {
    const found = await lockRevisionRequest(tx, id);
    if (!found) {
      throw new NotFoundError(NO_SUCH_REVISION);
    }
    if (found.decision) {
      throw new ConflictError(ALREADY_DECIDED);
    }
    return decideRevisionRequest(tx, id, 'rejected', decidedBy);
  });
}

/**
 * The recipe is saved with the revision (`PUT /api/recipes/:id` with `revisionId`), in the save's transaction: 404 for
 * a revision of another recipe, 409 for one without a revised recipe or already decided.
 */
export async function acceptRevision(
  tx: DbExecutor,
  id: string,
  recipeId: string,
  decidedBy: string,
): Promise<void> {
  const found = await lockRevisionRequest(tx, id);
  if (!found || found.recipeId !== recipeId) {
    throw new NotFoundError(NO_SUCH_REVISION);
  }
  if (found.decision) {
    throw new ConflictError(ALREADY_DECIDED);
  }
  if (!found.revision) {
    throw new ConflictError(NOT_READY);
  }
  await decideRevisionRequest(tx, id, 'accepted', decidedBy);
}
