import {
  normalizeSourceUrl,
  type RecipeImportDetail,
  type RecipeImportParams,
  type RecipeImportRequest,
  type RecipeNormalizeInput,
  type RecipeNormalizeOutput,
  type RecipeNormalizeSource,
} from '@family/shared';
import type { Db, DbExecutor } from '../db/client.js';
import {
  findIngredientsByIds,
  listRegistryIngredients,
} from '../db/repositories/ingredients.js';
import {
  findImportedSuggestion,
  findImportRequest,
  findImportSource,
  findSourceUrlMatches,
  insertImportedSuggestion,
  insertImportRequest,
  listImportRequests,
  setImportNoResults,
  setImportUrl,
} from '../db/repositories/recipe-imports.js';
import { recipeImportRequest } from '../db/schema/food.js';
import type { ContractImage } from '../openclaw/client.js';
import {
  ContractRequestFailure,
  type ContractRequestHandle,
  type ContractRequestStore,
} from './contract-requests.js';
import { AlreadyImportedError, NotFoundError } from './errors.js';
import { readRecipePage } from './recipe-page/index.js';

const NO_SUCH_IMPORT = 'Няма такова внасяне';

/**
 * What the api imports: the client's JSON (text, link), or a photo from the multipart form, whose bytes stay in memory
 * until its run starts and are never stored.
 */
export type ImportParams =
  | RecipeImportParams
  | { kind: 'photo'; photo: ContractImage };

/** `recipe.normalize` as AI requests (GLOSSARY: Внасяне на рецепта), registered in `buildApp()`. */
export type RecipeImportRequests = ContractRequestHandle<
  ImportParams,
  RecipeImportRequest
>;

/**
 * How imports are stored: the input is the source plus the whole registry (id, name, base unit); a valid answer
 * stores its one recipe as a suggestion of the import, or ends `no_results` when the agent says the source has none.
 * A link already in the registry is refused before anything is stored (409 `already_imported`, unless `force`); the
 * page of a link is fetched and read when the run starts (`recipe-page/`), and a page that will not open ends the run
 * `fetch_blocked` or `fetch_failed` without asking the agent. A photo is kept in this store's memory from the `POST`
 * until its run starts, then goes to the agent as an image next to the input (`{ kind: 'photo' }`); the database
 * never sees it, and a run whose photo is gone ends `stale`. Approval and rejection of the suggestion are the
 * suggestions' own (`app.recipeSuggestions`).
 */
export function createRecipeImportStore(): ContractRequestStore<
  ImportParams,
  RecipeImportRequest,
  RecipeNormalizeInput,
  RecipeNormalizeOutput
> {
  const photos = new Map<string, ContractImage>();
  return {
    table: recipeImportRequest,
    async insert(tx, params, requestedBy) {
      if (params.kind === 'photo') {
        const request = await insertImportRequest(
          tx,
          { kind: 'photo' },
          requestedBy,
        );
        photos.set(request.id, params.photo);
        return request;
      }
      if (params.kind === 'url' && !params.force) {
        const matches = await findSourceUrlMatches(tx, params.url);
        if (matches.recipe || matches.suggestion) {
          throw new AlreadyImportedError(
            matches.recipe
              ? `Вече е в регистъра: ${matches.recipe.title}`
              : `Вече чака одобрение: ${matches.suggestion?.title}`,
            matches,
          );
        }
      }
      return insertImportRequest(tx, params, requestedBy);
    },
    find: findImportRequest,

    images(request) {
      if (request.source !== 'photo') {
        return [];
      }
      const photo = photos.get(request.id);
      photos.delete(request.id);
      if (!photo) {
        throw new ContractRequestFailure(
          'stale',
          'the photo of the import is no longer in memory',
        );
      }
      return [photo];
    },

    async buildInput(db, request) {
      return {
        source: await agentSource(db, request.id),
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
}

/**
 * Pasted text goes to the agent as it is; a link as the page read from it, whose final URL the import keeps
 * normalised (no utm, `#` or trailing `/`; one spelling of its escapes).
 */
async function agentSource(
  db: DbExecutor,
  id: string,
): Promise<RecipeNormalizeSource> {
  const source = await findImportSource(db, id);
  if (source.kind === 'text' || source.kind === 'photo') {
    return source;
  }
  const page = await readRecipePage(source.url);
  if (!page.ok) {
    throw new ContractRequestFailure(
      page.failure,
      `${page.reason}: ${page.url}`,
    );
  }
  const url = normalizeSourceUrl(page.url);
  if (url !== source.url) {
    await setImportUrl(db, id, url);
  }
  return page.jsonLd
    ? { kind: 'page', url, jsonLd: page.jsonLd }
    : { kind: 'page', url, text: page.text };
}

export interface RecipeImportsService {
  /** Stores a `pending` import and starts its run in the background; the import is returned at once. */
  requestImport(
    params: ImportParams,
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
