import type {
  ContractRecipe,
  RecipeReviseInput,
  RecipeReviseOutput,
  RecipeRevisionRequest,
  RevisableRecipe,
  RevisionLine,
} from '@family/shared';
import type { Db, DbExecutor } from '../db/client.js';
import {
  findIngredientsByIds,
  listRegistryIngredients,
} from '../db/repositories/ingredients.js';
import {
  decideRevisionRequest,
  findOpenSuggestionRevision,
  findRevisionBaseRecipe,
  findRevisionRequest,
  insertRevisionRequest,
  lockRecipeUpdatedAt,
  lockRevisionRequest,
  setRevision,
  setRevisionNoResults,
} from '../db/repositories/recipe-revisions.js';
import { lockSuggestion } from '../db/repositories/recipe-suggestions.js';
import { findRecipe } from '../db/repositories/recipes.js';
import { recipeRevisionRequest } from '../db/schema/food.js';
import {
  contractRecipe,
  photosByRef,
  revisableContractRecipe,
} from './contract-recipe.js';
import type {
  ContractRequestHandle,
  ContractRequestStore,
} from './contract-requests.js';
import { ConflictError, NotFoundError, refuse } from './errors.js';

const NO_SUCH_RECIPE = 'Няма такава рецепта';
const NO_SUCH_SUGGESTION = 'Няма такова предложение';
const SUGGESTION_DECIDED = 'Предложението вече е одобрено или отхвърлено';
const REVISION_OPEN = 'Предложението вече има поправка, която чака преглед';
const NO_SUCH_REVISION = 'Няма такава поправка на рецепта';
const ALREADY_DECIDED = 'Поправката вече е приета или отхвърлена';
const NOT_READY = 'Поправката още не е готова';

/**
 * What „✏️ Поправи с AI“ asks: the instruction, and the recipe of the registry, or the suggestion with its review form's
 * recipe (the form is not saved).
 */
export type RevisionParams = { instruction: string } & (
  | { recipeId: string }
  | { suggestionId: string; recipe: RevisableRecipe }
);

/**
 * „✏️ Поправи с AI“ (GLOSSARY: Поправка на рецепта): `recipe.revise` as AI requests, registered in `buildApp()` as
 * `app.recipeRevisions`. Works without an acting user (the kiosk).
 */
export type RecipeRevisions = ContractRequestHandle<
  RevisionParams,
  RecipeRevisionRequest,
  string | null
>;

/** What the run read when it started: the recipe as the agent reads it and its photos by reference. */
interface Loaded {
  recipe: ContractRecipe;
  /** The photo of each step that has one, by its reference `e1`, `e2`, … in the input. */
  ownPhotos: Map<string, string>;
}

/**
 * How `recipe.revise` requests are stored: refused for an unknown recipe; the request remembers when the recipe was
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

    async insert(tx, params, requestedBy) {
      const { instruction } = params;
      if ('suggestionId' in params) {
        const { suggestionId, recipe } = params;
        const suggestion = await lockSuggestion(tx, suggestionId);
        if (!suggestion) {
          throw new NotFoundError(NO_SUCH_SUGGESTION);
        }
        if (suggestion.status !== 'proposed') {
          throw new ConflictError(SUGGESTION_DECIDED);
        }
        const open = await findOpenSuggestionRevision(tx, suggestionId);
        if (open) {
          throw refuse('revision_open', REVISION_OPEN, { revisionId: open });
        }
        return insertRevisionRequest(tx, {
          suggestionId,
          instruction,
          requestedBy,
          baseRecipe: recipe,
        });
      }
      const { recipeId } = params;
      const baseUpdatedAt = await lockRecipeUpdatedAt(tx, recipeId);
      if (!baseUpdatedAt) {
        throw new NotFoundError(NO_SUCH_RECIPE);
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
      if (request.recipeId === undefined) {
        const base = await findRevisionBaseRecipe(db, request.id);
        if (!base) {
          throw new Error(
            'revision request of a suggestion without its recipe',
          );
        }
        const ownPhotos = photosByRef(base);
        return { recipe: revisableContractRecipe(base, ownPhotos), ownPhotos };
      }
      const recipe = await findRecipe(db, request.recipeId);
      if (!recipe) {
        throw new Error('recipe of a revision request vanished');
      }
      const ownPhotos = photosByRef(recipe);
      return { recipe: contractRecipe(recipe, ownPhotos), ownPhotos };
    },

    async buildInput(db, request, { recipe }) {
      return {
        recipe,
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
export function acceptRevision(
  tx: DbExecutor,
  id: string,
  recipeId: string,
  decidedBy: string,
): Promise<void> {
  return accept(tx, id, (found) => found.recipeId === recipeId, decidedBy);
}

/**
 * The suggestion is approved with the revision (`POST /api/recipe-suggestions/:id/approve` with `revisionId`), in the
 * approval's transaction: 404 for a revision of another suggestion, 409 as for {@link acceptRevision}.
 */
export function acceptSuggestionRevision(
  tx: DbExecutor,
  id: string,
  suggestionId: string,
  decidedBy: string,
): Promise<void> {
  return accept(
    tx,
    id,
    (found) => found.suggestionId === suggestionId,
    decidedBy,
  );
}

async function accept(
  tx: DbExecutor,
  id: string,
  isOfTarget: (found: RecipeRevisionRequest) => boolean,
  decidedBy: string,
): Promise<void> {
  const found = await lockRevisionRequest(tx, id);
  if (!found || !isOfTarget(found)) {
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
