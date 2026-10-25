import {
  RECIPE_SUGGEST_RESPONSE_JSON_SCHEMA,
  type Recipe,
  type RecipeInput,
  type RecipeSuggestInput,
  type RecipeSuggestion,
  type RecipeSuggestParams,
  recipeSuggestAgentOutputSchema,
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
  type OpenClawClient,
  OpenClawHttpError,
  OpenClawInvalidOutputError,
  OpenClawTimeoutError,
} from '../openclaw/client.js';
import {
  ConflictError,
  NotFoundError,
  OpenClawUnavailableError,
} from './errors.js';
import { addRecipe } from './recipes.js';

/** A `pending` request older than this cannot still be running (one api instance, 180 s timeout) after a restart. */
const STALE_AFTER_MS = 10 * 60 * 1000;

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
  agent,
  log,
}: {
  db: Db;
  openclaw: OpenClawClient | null;
  agent: string;
  log: FastifyBaseLogger;
}): RecipeSuggestionsService {
  const shutdown = new AbortController();
  const running = new Set<Promise<void>>();

  async function runRequest(
    client: OpenClawClient,
    request: SuggestionRequest,
  ): Promise<void> {
    try {
      const input: RecipeSuggestInput = {
        slot: request.slot,
        maxMinutes: request.maxMinutes,
        tags: request.tags.length > 0 ? request.tags : undefined,
        hint: request.hint,
        existingRecipeTitles: await listActiveRecipeTitles(db),
        ingredientNames: await listIngredientNames(db),
      };
      const output = await client.complete({
        agent,
        input,
        outputSchema: recipeSuggestAgentOutputSchema,
        jsonSchema: {
          name: 'recipe_suggest',
          schema: RECIPE_SUGGEST_RESPONSE_JSON_SCHEMA,
        },
        signal: shutdown.signal,
      });
      await db.transaction(async (tx) => {
        await insertSuggestions(tx, request.id, output.suggestions);
        await finishSuggestionRequest(tx, request.id, 'done', null);
      });
    } catch (error) {
      const code = errorCode(error);
      if (code === 'error') {
        log.error(
          { err: error, requestId: request.id },
          'recipe.suggest failed',
        );
      } else {
        log.warn(
          { requestId: request.id, error: code },
          'recipe.suggest failed',
        );
      }
      await finishSuggestionRequest(db, request.id, 'failed', code).catch(
        (writeError: unknown) =>
          log.error(
            { err: writeError, requestId: request.id },
            'could not mark the suggestion request failed',
          ),
      );
    }
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
      const client = openclaw;
      if (!client) {
        throw new OpenClawUnavailableError(
          'Предложенията не са достъпни: OpenClaw не е настроен',
        );
      }
      const request = await insertSuggestionRequest(db, params, actingUserId);
      // Not awaited: the client polls GET …/requests/:id. runRequest catches and records its own errors.
      const run = new Promise<void>((resolve) => setImmediate(resolve)).then(
        () => runRequest(client, request),
      );
      running.add(run);
      void run.finally(() => running.delete(run));
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
      return failPendingRequestsBefore(
        db,
        new Date(Date.now() - STALE_AFTER_MS),
        'stale',
      );
    },

    async close() {
      shutdown.abort();
      await Promise.all(running);
    },
  };
}

/** The short `error` of a failed request: `timeout`, `invalid_output`, `http_<status>`, `aborted` or `error`. */
function errorCode(error: unknown): string {
  if (error instanceof OpenClawTimeoutError) {
    return 'timeout';
  }
  if (error instanceof OpenClawInvalidOutputError) {
    return 'invalid_output';
  }
  if (error instanceof OpenClawHttpError) {
    return `http_${error.status}`;
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return 'aborted';
  }
  return 'error';
}
