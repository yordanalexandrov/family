import {
  type AlreadyImported,
  type ImportedSuggestion,
  type NormalizedRecipe,
  normalizeSourceUrl,
  type RecipeImportParams,
  type RecipeImportRequest,
} from '@family/shared';
import {
  and,
  desc,
  eq,
  getTableColumns,
  isNotNull,
  isNull,
  sql,
} from 'drizzle-orm';
import type { DbExecutor } from '../client.js';
import {
  recipe,
  recipeImportRequest,
  recipeSuggestion,
} from '../schema/food.js';
import { toImportedSuggestion } from './recipe-suggestions.js';

type RequestRow = typeof recipeImportRequest.$inferSelect;

/** The request with its one suggestion's id and title, when there is one. */
const requestColumns = {
  ...getTableColumns(recipeImportRequest),
  suggestionId: recipeSuggestion.id,
  title: sql<string | null>`${recipeSuggestion.payload} ->> 'title'`,
};

type RequestWithSuggestion = RequestRow & {
  suggestionId: string | null;
  title: string | null;
};

/** API shape of an import: DB nulls of optional fields become absent, dates ISO strings; the source text stays here. */
function toRequest(row: RequestWithSuggestion): RecipeImportRequest {
  return {
    id: row.id,
    status: row.status,
    error: row.error ?? undefined,
    source: row.source,
    url: row.url ?? undefined,
    requestedBy: row.requestedBy,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? undefined,
    suggestionId: row.suggestionId ?? undefined,
    title: row.title ?? undefined,
    noResults: row.noResults ?? undefined,
  };
}

function selectRequests(db: DbExecutor) {
  return db
    .select(requestColumns)
    .from(recipeImportRequest)
    .leftJoin(
      recipeSuggestion,
      eq(recipeSuggestion.importRequestId, recipeImportRequest.id),
    );
}

/** A new `pending` import; the pasted text and the link are kept with it. */
export async function insertImportRequest(
  db: DbExecutor,
  params: RecipeImportParams,
  requestedBy: string,
): Promise<RecipeImportRequest> {
  const [row] = await db
    .insert(recipeImportRequest)
    .values({
      source: params.kind,
      url: params.url ?? null,
      text: params.kind === 'text' ? params.text : null,
      requestedBy,
    })
    .returning();
  if (!row) {
    throw new Error('insert into recipe_import_request returned no row');
  }
  return toRequest({ ...row, suggestionId: null, title: null });
}

export async function findImportRequest(
  db: DbExecutor,
  id: string,
): Promise<RecipeImportRequest | undefined> {
  const [row] = await selectRequests(db)
    .where(eq(recipeImportRequest.id, id))
    .limit(1);
  return row && toRequest(row);
}

/** The latest imports, newest first. */
export async function listImportRequests(
  db: DbExecutor,
  limit: number,
): Promise<RecipeImportRequest[]> {
  const rows = await selectRequests(db)
    .orderBy(desc(recipeImportRequest.createdAt))
    .limit(limit);
  return rows.map(toRequest);
}

/** The agent's reason why the source has no recipe. */
export async function setImportNoResults(
  db: DbExecutor,
  id: string,
  reason: string,
): Promise<void> {
  await db
    .update(recipeImportRequest)
    .set({ noResults: reason })
    .where(eq(recipeImportRequest.id, id));
}

/** What an import kept of its source: the pasted text (and its link), or the link to fetch. */
export type ImportSource =
  | { kind: 'text'; text: string; url?: string }
  | { kind: 'url'; url: string };

export async function findImportSource(
  db: DbExecutor,
  id: string,
): Promise<ImportSource> {
  const [row] = await db
    .select({
      source: recipeImportRequest.source,
      url: recipeImportRequest.url,
      text: recipeImportRequest.text,
    })
    .from(recipeImportRequest)
    .where(eq(recipeImportRequest.id, id))
    .limit(1);
  if (row?.source === 'url' && row.url !== null) {
    return { kind: 'url', url: row.url };
  }
  if (!row || row.text === null) {
    throw new Error(`recipe_import_request ${id} has no text`);
  }
  return {
    kind: 'text',
    text: row.text,
    ...(row.url === null ? {} : { url: row.url }),
  };
}

/** The page's final URL after redirects: the link the import (and its suggestion's review) shows from now on. */
export async function setImportUrl(
  db: DbExecutor,
  id: string,
  url: string,
): Promise<void> {
  await db
    .update(recipeImportRequest)
    .set({ url })
    .where(eq(recipeImportRequest.id, id));
}

/**
 * The recipe (not archived) and the proposed suggestion whose source link is `url`, compared by
 * `normalizeSourceUrl`: the link of an imported suggestion is its import's (the final URL), a suggested one's is in
 * its payload. Few rows, so they are compared here rather than in SQL.
 */
export async function findSourceUrlMatches(
  db: DbExecutor,
  url: string,
): Promise<Pick<AlreadyImported, 'recipe' | 'suggestion'>> {
  const wanted = normalizeSourceUrl(url);
  const same = (candidate: string | null) =>
    candidate !== null && normalizeSourceUrl(candidate) === wanted;

  const recipes = await db
    .select({ id: recipe.id, title: recipe.title, url: recipe.sourceUrl })
    .from(recipe)
    .where(and(isNull(recipe.archivedAt), isNotNull(recipe.sourceUrl)));
  const suggestions = await db
    .select({
      id: recipeSuggestion.id,
      title: sql<string>`${recipeSuggestion.payload} ->> 'title'`,
      requestId: recipeSuggestion.requestId,
      importRequestId: recipeSuggestion.importRequestId,
      url: sql<
        string | null
      >`coalesce(${recipeImportRequest.url}, ${recipeSuggestion.payload} ->> 'sourceUrl')`,
    })
    .from(recipeSuggestion)
    .leftJoin(
      recipeImportRequest,
      eq(recipeSuggestion.importRequestId, recipeImportRequest.id),
    )
    .where(eq(recipeSuggestion.status, 'proposed'));

  const matchedRecipe = recipes.find((row) => same(row.url));
  const matchedSuggestion = suggestions.find((row) => same(row.url));
  return {
    ...(matchedRecipe
      ? { recipe: { id: matchedRecipe.id, title: matchedRecipe.title } }
      : {}),
    ...(matchedSuggestion
      ? {
          suggestion: {
            id: matchedSuggestion.id,
            title: matchedSuggestion.title,
            ...(matchedSuggestion.importRequestId
              ? { importRequestId: matchedSuggestion.importRequestId }
              : matchedSuggestion.requestId
                ? { requestId: matchedSuggestion.requestId }
                : {}),
          },
        }
      : {}),
  };
}

/** Stores the one suggestion of an import. */
export async function insertImportedSuggestion(
  db: DbExecutor,
  importRequestId: string,
  payload: NormalizedRecipe,
): Promise<void> {
  await db
    .insert(recipeSuggestion)
    .values({ importRequestId, position: 0, payload });
}

export async function findImportedSuggestion(
  db: DbExecutor,
  importRequestId: string,
): Promise<ImportedSuggestion | undefined> {
  const [row] = await db
    .select()
    .from(recipeSuggestion)
    .where(eq(recipeSuggestion.importRequestId, importRequestId))
    .limit(1);
  return row && toImportedSuggestion(row);
}
