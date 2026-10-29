import {
  type AnyRecipeSuggestion,
  type ApproveSuggestionInput,
  canonicalTitle,
  type Recipe,
  type RecipeSuggestInput,
  type RecipeSuggestOutput,
  type RecipeSuggestParams,
  type SuggestionRequest,
  type SuggestionRequestDetail,
} from '@family/shared';
import type { Db, DbExecutor } from '../db/client.js';
import { listEnabledApplianceNames } from '../db/repositories/appliances.js';
import { listIngredientNames } from '../db/repositories/ingredients.js';
import {
  decideSuggestion,
  findSuggestionRequest,
  insertSuggestionRequest,
  insertSuggestions,
  listSuggestionRequests,
  listSuggestions,
  lockSuggestion,
  undecideSuggestion,
} from '../db/repositories/recipe-suggestions.js';
import {
  listActiveRecipesByTitle,
  listActiveRecipeTitles,
} from '../db/repositories/recipes.js';
import { recipeSuggestionRequest } from '../db/schema/food.js';
import type {
  ContractRequestHandle,
  ContractRequestStore,
} from './contract-requests.js';
import { ConflictError, NotFoundError } from './errors.js';
import { addRecipe } from './recipes.js';

const NO_SUCH_REQUEST = 'Няма такава заявка за предложения';
const NO_SUCH_SUGGESTION = 'Няма такова предложение';
const ALREADY_DECIDED = 'Предложението вече е решено';
const ONLY_REJECTED_RESTORED = 'Само отхвърлено предложение може да се върне';

export interface RecipeSuggestionsService {
  /** Stores a `pending` request and starts its run in the background; the request is returned at once. */
  requestSuggestions(
    params: RecipeSuggestParams,
    actingUserId: string,
  ): Promise<SuggestionRequest>;
  listRequests(limit: number): Promise<SuggestionRequest[]>;
  getRequest(id: string): Promise<SuggestionRequestDetail>;
  /**
   * Copies the (edited) suggestion into the registry and marks it approved, in one transaction. Without `appliance` in
   * the input the recipe takes the suggestion's; `null` is none.
   */
  approveSuggestion(
    id: string,
    input: ApproveSuggestionInput,
    actingUserId: string,
  ): Promise<{ recipe: Recipe; suggestion: AnyRecipeSuggestion }>;
  rejectSuggestion(
    id: string,
    actingUserId: string,
  ): Promise<AnyRecipeSuggestion>;
  /** „Върни“ after „Отхвърли“: a rejected suggestion is `proposed` again. An approved one has its recipe and stays. */
  restoreSuggestion(id: string): Promise<AnyRecipeSuggestion>;
}

/** `recipe.suggest` as AI requests (GLOSSARY: Заявка за предложения), registered in `buildApp()`. */
export type SuggestionRequests = ContractRequestHandle<
  RecipeSuggestParams,
  SuggestionRequest
>;

/**
 * How `recipe.suggest` requests are stored: the input is the request plus the registry context (active recipe titles,
 * ingredient names) and the enabled household appliances; a valid answer stores the suggestions in the agent's order, or ends
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
      appliances: await listEnabledApplianceNames(db),
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
 * The suggestions with `duplicateOf` on each proposed one whose title a recipe in the registry already has (canonically);
 * a decided suggestion gets none, an approved one would find its own recipe.
 */
export async function withDuplicateOf<T extends AnyRecipeSuggestion>(
  db: DbExecutor,
  suggestions: T[],
): Promise<T[]> {
  if (!suggestions.some((s) => s.status === 'proposed')) {
    return suggestions;
  }
  const byTitle = await listActiveRecipesByTitle(db);
  return suggestions.map((suggestion) => {
    const duplicateOf =
      suggestion.status === 'proposed'
        ? byTitle.get(canonicalTitle(suggestion.payload.title))
        : undefined;
    return duplicateOf ? { ...suggestion, duplicateOf } : suggestion;
  });
}

/** The appliance the agent gave the suggestion, `null` for none; a suggestion of an import has none. */
function applianceOf(suggestion: AnyRecipeSuggestion): string | null {
  return 'appliance' in suggestion.payload
    ? (suggestion.payload.appliance ?? null)
    : null;
}

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
  /** The suggestion, locked, if it has the status `expected`; otherwise 404, or 409 with `conflict` and the suggestion. */
  async function lockWith(
    tx: DbExecutor,
    id: string,
    expected: AnyRecipeSuggestion['status'],
    conflict: string,
  ): Promise<AnyRecipeSuggestion> {
    const suggestion = await lockSuggestion(tx, id);
    if (!suggestion) {
      throw new NotFoundError(NO_SUCH_SUGGESTION);
    }
    if (suggestion.status !== expected) {
      throw new ConflictError(conflict, { suggestion });
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
      return {
        request,
        suggestions: await withDuplicateOf(db, await listSuggestions(db, id)),
      };
    },

    approveSuggestion(id, input, actingUserId) {
      return db.transaction(async (tx) => {
        const proposed = await lockWith(tx, id, 'proposed', ALREADY_DECIDED);
        const { appliance = applianceOf(proposed), ...rest } = input;
        const recipe = await addRecipe(tx, {
          ...rest,
          ...(appliance === null ? {} : { appliance }),
        });
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
        await lockWith(tx, id, 'proposed', ALREADY_DECIDED);
        return decideSuggestion(tx, id, {
          status: 'rejected',
          recipeId: null,
          decidedBy: actingUserId,
        });
      });
    },

    restoreSuggestion(id) {
      return db.transaction(async (tx) => {
        await lockWith(tx, id, 'rejected', ONLY_REJECTED_RESTORED);
        return undecideSuggestion(tx, id);
      });
    },
  };
}
