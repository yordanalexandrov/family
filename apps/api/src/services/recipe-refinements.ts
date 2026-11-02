import type {
  Recipe,
  RecipeRefineInput,
  RecipeRefineOutput,
  RecipeRefineRequest,
  RefinementSource,
} from '@family/shared';
import {
  findRefineRequest,
  hasPendingRefinement,
  insertRefineRequest,
  lockRecipe,
  setRefinement,
  setRefineNoResults,
} from '../db/repositories/recipe-refinements.js';
import { findRecipe } from '../db/repositories/recipes.js';
import { recipeRefineRequest } from '../db/schema/food.js';
import { contractRecipe, photosByRef } from './contract-recipe.js';
import type {
  ContractRequestHandle,
  ContractRequestStore,
} from './contract-requests.js';
import { ConflictError, NotFoundError } from './errors.js';
import {
  type PreparedStepPhotos,
  prepareStepPhotos,
  stepsWithPhotos,
} from './imported-step-photos.js';
import { readRecipePage, type StepImages } from './recipe-page/index.js';

const NO_SUCH_RECIPE = 'Няма такава рецепта';
const RECIPE_HAS_PENDING = 'Рецептата вече се подобрява';

/**
 * „Подобри рецептата“: `recipe.refine` as AI requests, registered in `buildApp()` as `app.recipeRefinements`; the params
 * are the recipe's id. One request per recipe at a time; the refinement changes the recipe only when the person saves
 * the form with it.
 */
export type RecipeRefinements = ContractRequestHandle<
  string,
  RecipeRefineRequest
>;

/** What the run read when it started: the recipe, its photos by reference, and the page of its source. */
interface Loaded {
  recipe: Recipe;
  /** The photo of each step that has one, by its reference `e1`, `e2`, … in the input. */
  ownPhotos: Map<string, string>;
  source: RefinementSource;
  page: RecipeRefineInput['source'];
  stepImages: StepImages;
}

/** What `prepare` hands `onDone`: the page's photos the agent chose, made ready, and what the run read. */
interface Prepared {
  photos: PreparedStepPhotos;
  loaded: Loaded;
}

/**
 * How `recipe.refine` requests are stored: refused for an unknown recipe or while one is pending for it. When the run
 * starts the recipe is read, and so is the page of its link again (`readRecipePage`, as an import by link); a page that
 * will not open does not stop it, the agent then refines the recipe alone and the refinement says so (`unread`). The
 * photos of the page the agent chose are downloaded and stored as new step photos (`prepare`, as for an import); they
 * stay orphans, for the nightly cleanup, unless the person saves the form with them.
 */
export function createRecipeRefineStore(): ContractRequestStore<
  string,
  RecipeRefineRequest,
  RecipeRefineInput,
  RecipeRefineOutput,
  string,
  Prepared,
  Loaded
> {
  return {
    table: recipeRefineRequest,

    async insert(tx, recipeId, requestedBy) {
      if (!(await lockRecipe(tx, recipeId))) {
        throw new NotFoundError(NO_SUCH_RECIPE);
      }
      if (await hasPendingRefinement(tx, recipeId)) {
        throw new ConflictError(RECIPE_HAS_PENDING);
      }
      return insertRefineRequest(tx, recipeId, requestedBy);
    },

    find: findRefineRequest,

    async load(db, request) {
      const recipe = await findRecipe(db, request.recipeId);
      if (!recipe) {
        throw new Error('recipe of a refine request vanished');
      }
      return {
        recipe,
        ownPhotos: photosByRef(recipe),
        ...(await sourceOf(recipe)),
      };
    },

    async buildInput(_db, _request, { recipe, ownPhotos, page }) {
      return { recipe: contractRecipe(recipe, ownPhotos), source: page };
    },

    async prepare(output, loaded, signal) {
      return {
        loaded,
        photos: output.recipe
          ? await prepareStepPhotos(
              loaded.stepImages,
              output.recipe.steps,
              signal,
            )
          : new Map(),
      };
    },

    async onDone(tx, request, output, prepared) {
      const refined = output.recipe;
      if (!refined || !prepared) {
        return;
      }
      const { ownPhotos, recipe, source } = prepared.loaded;
      // The page's photos are stored here; the recipe's own keep their ids.
      const { steps, dropped } = await stepsWithPhotos(
        tx,
        refined.steps,
        prepared.photos,
        ownPhotos,
      );
      await setRefinement(tx, request.id, {
        steps,
        ...(recipe.prepMinutes === undefined && refined.prepMinutes !== null
          ? { prepMinutes: refined.prepMinutes }
          : {}),
        preparation: refined.preparation,
        changes: refined.changes,
        source,
        droppedPhotos: dropped,
      });
    },

    noResults(output) {
      return output.noResults;
    },

    async onNoResults(tx, request, reason) {
      await setRefineNoResults(tx, request.id, reason);
    },
  };
}

/**
 * The page of the recipe's link, read again as for an import by link, with the URLs of its photos by the references
 * the agent gets instead; none without a link, or when the page does not open (`unread`).
 */
async function sourceOf(
  recipe: Recipe,
): Promise<Pick<Loaded, 'source' | 'page' | 'stepImages'>> {
  if (!recipe.sourceUrl) {
    return { source: 'none', page: null, stepImages: {} };
  }
  const page = await readRecipePage(recipe.sourceUrl);
  if (!page.ok) {
    return { source: 'unread', page: null, stepImages: {} };
  }
  const stepImages = page.stepImages ?? {};
  return {
    source: 'read',
    page: {
      url: page.url,
      ...(page.jsonLd ? { jsonLd: page.jsonLd } : { text: page.text }),
      photos: Object.keys(stepImages),
    },
    stepImages,
  };
}
