import type {
  ImportedSuggestion,
  NormalizedRecipe,
  RecipeImportParams,
  RecipeImportRequest,
  RecipeNormalizeSource,
} from '@family/shared';
import { desc, eq, getTableColumns, sql } from 'drizzle-orm';
import type { DbExecutor } from '../client.js';
import { recipeImportRequest, recipeSuggestion } from '../schema/food.js';
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
      text: params.text,
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

/** The source as the agent gets it, from what the import kept. */
export async function findImportSource(
  db: DbExecutor,
  id: string,
): Promise<RecipeNormalizeSource> {
  const [row] = await db
    .select({ url: recipeImportRequest.url, text: recipeImportRequest.text })
    .from(recipeImportRequest)
    .where(eq(recipeImportRequest.id, id))
    .limit(1);
  if (!row || row.text === null) {
    throw new Error(`recipe_import_request ${id} has no text`);
  }
  return {
    kind: 'text',
    text: row.text,
    ...(row.url === null ? {} : { url: row.url }),
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
