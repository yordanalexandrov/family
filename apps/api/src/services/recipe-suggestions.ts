import {
  type AnyRecipeSuggestion,
  APPLIANCES,
  type Recipe,
  type RecipeInput,
  type RecipeSuggestInput,
  type RecipeSuggestOutput,
  type RecipeSuggestParams,
  type SuggestionRequest,
  type SuggestionRequestDetail,
} from '@family/shared';
import type { Db, DbExecutor } from '../db/client.js';
import { listIngredientNames } from '../db/repositories/ingredients.js';
import {
  decideSuggestion,
  findSuggestionRequest,
  insertSuggestionRequest,
  insertSuggestions,
  listSuggestionRequests,
  listSuggestions,
  lockSuggestion,
} from '../db/repositories/recipe-suggestions.js';
import { listActiveRecipeTitles } from '../db/repositories/recipes.js';
import { recipeSuggestionRequest } from '../db/schema/food.js';
import type {
  ContractRequestHandle,
  ContractRequestStore,
} from './contract-requests.js';
import { ConflictError, NotFoundError } from './errors.js';
import { addRecipe } from './recipes.js';

const NO_SUCH_REQUEST = 'Няма такава заявка за предложения';
const NO_SUCH_SUGGESTION = 'Няма такова предложение';

export interface RecipeSuggestionsService {
  /** Stores a `pending` request and starts its run in the background; the request is returned at once. */
  requestSuggestions(
    params: RecipeSuggestParams,
    actingUserId: string,
  ): Promise<SuggestionRequest>;
  listRequests(limit: number): Promise<SuggestionRequest[]>;
  getRequest(id: string): Promise<SuggestionRequestDetail>;
  /** Copies the (edited) suggestion into the registry and marks it approved, in one transaction. */
  approveSuggestion(
    id: string,
    input: RecipeInput,
    actingUserId: string,
  ): Promise<{ recipe: Recipe; suggestion: AnyRecipeSuggestion }>;
  rejectSuggestion(
    id: string,
    actingUserId: string,
  ): Promise<AnyRecipeSuggestion>;
}

/** `recipe.suggest` as AI requests (GLOSSARY: Заявка за предложения), registered in `buildApp()`. */
export type SuggestionRequests = ContractRequestHandle<
  RecipeSuggestParams,
  SuggestionRequest
>;

/**
 * How `recipe.suggest` requests are stored: the input is the request plus the registry context (active recipe titles,
 * ingredient names) and the household appliances; a valid answer stores the suggestions in the agent's order, or ends
 * `no_results` when the agent found none.
 */
export const suggestionRequestStore: ContractRequestStore<
  RecipeSuggestParams,
  SuggestionRequest,
  RecipeSuggestInput,
  RecipeSuggestOutput
> = {
  table: recipeSuggestionRequest,
  insert: insertSuggestionRequest,
  find: findSuggestionRequest,

  async buildInput(db, request) {
    return {
      slots: request.slots,
      times: request.times.length > 0 ? request.times : undefined,
      tags: request.tags.length > 0 ? request.tags : undefined,
      hint: request.hint,
      existingRecipeTitles: await listActiveRecipeTitles(db),
      ingredientNames: await listIngredientNames(db),
      equipment: [...APPLIANCES],
    };
  },

  async onDone(tx, request, output) {
    await insertSuggestions(tx, request.id, output.suggestions);
  },

  noResults(output) {
    return output.noResults;
  },
};

/**
 * Suggestion requests and the decisions on their suggestions (GLOSSARY: Заявка за предложения, Предложение за рецепта),
 * also on the one suggestion of an import (`recipe.normalize`): approval and rejection do not depend on the origin. Created once in `buildApp()` as `app.recipeSuggestions`. Requests go through `requests`, registered with
 * {@link suggestionRequestStore}.
 */
export function createRecipeSuggestionsService({
  db,
  requests,
}: {
  db: Db;
  requests: SuggestionRequests;
}): RecipeSuggestionsService {
  async function decide(
    id: string,
    tx: DbExecutor,
  ): Promise<AnyRecipeSuggestion> {
    const suggestion = await lockSuggestion(tx, id);
    if (!suggestion) {
      throw new NotFoundError(NO_SUCH_SUGGESTION);
    }
    if (suggestion.status !== 'proposed') {
      throw new ConflictError('Предложението вече е решено', { suggestion });
    }
    return suggestion;
  }

  return {
    requestSuggestions(params, actingUserId) {
      return requests.request(params, actingUserId);
    },

    listRequests(limit) {
      return listSuggestionRequests(db, limit);
    },

    async getRequest(id) {
      const request = await requests.get(id);
      if (!request) {
        throw new NotFoundError(NO_SUCH_REQUEST);
      }
      return { request, suggestions: await listSuggestions(db, id) };
    },

    approveSuggestion(id, input, actingUserId) {
      return db.transaction(async (tx) => {
        await decide(id, tx);
        const recipe = await addRecipe(tx, input);
        const suggestion = await decideSuggestion(tx, id, {
          status: 'approved',
          recipeId: recipe.id,
          decidedBy: actingUserId,
        });
        return { recipe, suggestion };
      });
    },

    rejectSuggestion(id, actingUserId) {
      return db.transaction(async (tx) => {
        await decide(id, tx);
        return decideSuggestion(tx, id, {
          status: 'rejected',
          recipeId: null,
          decidedBy: actingUserId,
        });
      });
    },
  };
}
