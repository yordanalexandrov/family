import type {
  RecipeImportDetail,
  RecipeImportParams,
  RecipeImportRequest,
  RecipeNormalizeInput,
  RecipeNormalizeOutput,
} from '@family/shared';
import type { Db } from '../db/client.js';
import {
  findIngredientsByIds,
  listRegistryIngredients,
} from '../db/repositories/ingredients.js';
import {
  findImportedSuggestion,
  findImportRequest,
  findImportSource,
  insertImportedSuggestion,
  insertImportRequest,
  listImportRequests,
  setImportNoResults,
} from '../db/repositories/recipe-imports.js';
import { recipeImportRequest } from '../db/schema/food.js';
import type {
  ContractRequestHandle,
  ContractRequestStore,
} from './contract-requests.js';
import { NotFoundError } from './errors.js';

const NO_SUCH_IMPORT = 'Няма такова внасяне';

/** `recipe.normalize` as AI requests (GLOSSARY: Внасяне на рецепта), registered in `buildApp()`. */
export type RecipeImportRequests = ContractRequestHandle<
  RecipeImportParams,
  RecipeImportRequest
>;

/**
 * How imports are stored: the input is the kept source plus the whole registry (id, name, base unit); a valid answer
 * stores its one recipe as a suggestion of the import, or ends `no_results` when the agent says the source has none.
 * Approval and rejection of that suggestion are the suggestions' own (`app.recipeSuggestions`).
 */
export const recipeImportStore: ContractRequestStore<
  RecipeImportParams,
  RecipeImportRequest,
  RecipeNormalizeInput,
  RecipeNormalizeOutput
> = {
  table: recipeImportRequest,
  insert: insertImportRequest,
  find: findImportRequest,

  async buildInput(db, request) {
    return {
      source: await findImportSource(db, request.id),
      ingredients: await listRegistryIngredients(db),
    };
  },

  async onDone(tx, request, output) {
    if (output.recipe) {
      await insertImportedSuggestion(tx, request.id, output.recipe);
    }
  },

  noResults(output) {
    return output.noResults;
  },

  async onNoResults(tx, request, reason) {
    await setImportNoResults(tx, request.id, reason);
  },
};

export interface RecipeImportsService {
  /** Stores a `pending` import and starts its run in the background; the import is returned at once. */
  requestImport(
    params: RecipeImportParams,
    actingUserId: string,
  ): Promise<RecipeImportRequest>;
  listImports(limit: number): Promise<RecipeImportRequest[]>;
  /** The import, its suggestion once done, and the registry ingredients the suggestion's lines are linked to. */
  getImport(id: string): Promise<RecipeImportDetail>;
}

/** Imports of recipes (GLOSSARY: Внасяне на рецепта); created once in `buildApp()` as `app.recipeImports`. */
export function createRecipeImportsService({
  db,
  requests,
}: {
  db: Db;
  requests: RecipeImportRequests;
}): RecipeImportsService {
  return {
    requestImport(params, actingUserId) {
      return requests.request(params, actingUserId);
    },

    listImports(limit) {
      return listImportRequests(db, limit);
    },

    async getImport(id) {
      const request = await requests.get(id);
      if (!request) {
        throw new NotFoundError(NO_SUCH_IMPORT);
      }
      const suggestion = await findImportedSuggestion(db, id);
      const linked = suggestion?.payload.ingredients.flatMap((line) =>
        line.ingredientId ? [line.ingredientId] : [],
      );
      const source = await findImportSource(db, id);
      return {
        request,
        ...(source.kind === 'text' ? { text: source.text } : {}),
        ...(suggestion ? { suggestion } : {}),
        ingredients: await findIngredientsByIds(db, [...new Set(linked)]),
      };
    },
  };
}
