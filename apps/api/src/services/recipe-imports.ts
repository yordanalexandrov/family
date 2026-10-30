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
import {
  type DownloadedStepPhotos,
  downloadStepPhotos,
  stepsWithPhotos,
  withDroppedPhotos,
} from './imported-step-photos.js';
import { readRecipePage, type StepImages } from './recipe-page/index.js';
import { withDuplicateOf } from './recipe-suggestions.js';

const NO_SUCH_IMPORT = 'Няма такова внасяне';

/**
 * What the api imports: the client's JSON (text, link), or the photos from the multipart form (one photo, or the parts
 * of a long screenshot), whose bytes stay in memory until its run has asked the agent and are never stored.
 */
export type ImportParams =
  | RecipeImportParams
  | { kind: 'photo'; photos: ContractImage[] };

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
 * `fetch_blocked` or `fetch_failed` without asking the agent. A photo goes from the `POST` straight to the memory of
 * its run (`images`) and to the agent as an image next to the input (`{ kind: 'photo' }`); the database never sees
 * it. Approval and rejection of the suggestion are the suggestions' own (`app.recipeSuggestions`).
 *
 * A page's step photos (GLOSSARY: Снимка на стъпка) go to the agent as references only. Their URLs stay with the input
 * they were read for, here in memory; once the agent has answered, the photos it chose are downloaded (`prepare`,
 * outside the transaction) and stored with the suggestion, and the note of the suggestion says how many were dropped.
 */
export function createRecipeImportStore(): ContractRequestStore<
  ImportParams,
  RecipeImportRequest,
  RecipeNormalizeInput,
  RecipeNormalizeOutput,
  string,
  DownloadedStepPhotos
> {
  /** The URLs of the step photos of each input built from a page, by reference; gone with the input. */
  const stepImagesOf = new WeakMap<RecipeNormalizeInput, StepImages>();
  return {
    table: recipeImportRequest,
    async insert(tx, params, requestedBy) {
      if (params.kind === 'photo') {
        return insertImportRequest(tx, { kind: 'photo' }, requestedBy);
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

    images(params) {
      return params.kind === 'photo' ? params.photos : [];
    },

    async buildInput(db, request) {
      const { source, stepImages } = await agentSource(db, request.id);
      const input = {
        source,
        ingredients: await listRegistryIngredients(db),
      };
      if (stepImages) {
        stepImagesOf.set(input, stepImages);
      }
      return input;
    },

    async prepare(input, output, signal) {
      const stepImages = stepImagesOf.get(input);
      return stepImages && output.recipe
        ? downloadStepPhotos(stepImages, output.recipe.steps, signal)
        : new Map();
    },

    async onDone(tx, request, output, downloaded) {
      if (output.recipe) {
        const { steps, dropped } = await stepsWithPhotos(
          tx,
          output.recipe.steps,
          downloaded,
        );
        await insertImportedSuggestion(tx, request.id, {
          ...output.recipe,
          assumptions: withDroppedPhotos(output.recipe.assumptions, dropped),
          steps,
        });
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
 * normalised (no utm, `#` or trailing `/`; one spelling of its escapes), with the URLs of the step photos of its
 * JSON-LD by the references the agent gets instead.
 */
async function agentSource(
  db: DbExecutor,
  id: string,
): Promise<{ source: RecipeNormalizeSource; stepImages?: StepImages }> {
  const source = await findImportSource(db, id);
  if (source.kind === 'text' || source.kind === 'photo') {
    return { source };
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
    ? {
        source: { kind: 'page', url, jsonLd: page.jsonLd },
        ...(page.stepImages ? { stepImages: page.stepImages } : {}),
      }
    : { source: { kind: 'page', url, text: page.text } };
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
      const found = await findImportedSuggestion(db, id);
      const [suggestion] = found ? await withDuplicateOf(db, [found]) : [];
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
