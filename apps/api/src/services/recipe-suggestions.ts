import {
  type Recipe,
  type RecipeInput,
  type RecipeSuggestInput,
  type RecipeSuggestion,
  type RecipeSuggestParams,
  recipeSuggest,
  type SuggestionRequest,
  type SuggestionRequestDetail,
} from '@family/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { Db, DbExecutor } from '../db/client.js';
import { listIngredientNames } from '../db/repositories/ingredients.js';
import {
  decideSuggestion,
  failPendingRequestsBefore,
  findSuggestionRequest,
  finishSuggestionRequest,
  insertSuggestionRequest,
  insertSuggestions,
  listSuggestionRequests,
  listSuggestions,
  lockSuggestion,
} from '../db/repositories/recipe-suggestions.js';
import { listActiveRecipeTitles } from '../db/repositories/recipes.js';
import {
  createContractRuns,
  type OpenClawAgent,
  staleCutoff,
} from './contract-runs.js';
import {
  ConflictError,
  NotFoundError,
  OpenClawUnavailableError,
} from './errors.js';
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
  ): Promise<{ recipe: Recipe; suggestion: RecipeSuggestion }>;
  rejectSuggestion(id: string, actingUserId: string): Promise<RecipeSuggestion>;
  /** At start: `pending` requests older than 10 minutes were cut off by a restart and become `failed`/`stale`. */
  failStaleRequests(): Promise<number>;
  /** Aborts the runs still going (they end `failed`/`aborted`) and waits for them, before the pool closes. */
  close(): Promise<void>;
}

/**
 * `recipe.suggest` (GLOSSARY: Заявка за предложения): runs in the api process, so it keeps the runs in flight;
 * created once in `buildApp()` as `app.recipeSuggestions`. `openclaw: null` = disabled, requests are refused.
 */
export function createRecipeSuggestionsService({
  db,
  openclaw,
  log,
}: {
  db: Db;
  /** The agent that answers `recipe.suggest` (`OPENCLAW_RECIPE_AGENT`). */
  openclaw: OpenClawAgent | null;
  log: FastifyBaseLogger;
}): RecipeSuggestionsService {
  const runs = createContractRuns(log);

  async function runRequest(
    { client, agent }: OpenClawAgent,
    request: SuggestionRequest,
    signal: AbortSignal,
  ): Promise<void> {
    const input: RecipeSuggestInput = {
      slots: request.slots,
      times: request.times.length > 0 ? request.times : undefined,
      tags: request.tags.length > 0 ? request.tags : undefined,
      hint: request.hint,
      existingRecipeTitles: await listActiveRecipeTitles(db),
      ingredientNames: await listIngredientNames(db),
    };
    const output = await client.complete(recipeSuggest, input, {
      agent,
      signal,
    });
    await db.transaction(async (tx) => {
      await insertSuggestions(tx, request.id, output.suggestions);
      await finishSuggestionRequest(tx, request.id, 'done', null);
    });
  }

  async function decide(id: string, tx: DbExecutor): Promise<RecipeSuggestion> {
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
    async requestSuggestions(params, actingUserId) {
      const gateway = openclaw;
      if (!gateway) {
        throw new OpenClawUnavailableError(
          'Предложенията не са достъпни: OpenClaw не е настроен',
        );
      }
      const request = await insertSuggestionRequest(db, params, actingUserId);
      // The client polls GET …/requests/:id.
      runs.start({
        contract: 'recipe.suggest',
        logContext: { requestId: request.id },
        run: (signal) => runRequest(gateway, request, signal),
        fail: (code) => finishSuggestionRequest(db, request.id, 'failed', code),
      });
      return request;
    },

    listRequests(limit) {
      return listSuggestionRequests(db, limit);
    },

    async getRequest(id) {
      const request = await findSuggestionRequest(db, id);
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

    failStaleRequests() {
      return failPendingRequestsBefore(db, staleCutoff(), 'stale');
    },

    close() {
      return runs.close();
    },
  };
}
