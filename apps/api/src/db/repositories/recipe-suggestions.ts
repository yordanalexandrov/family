import type {
  AnyRecipeSuggestion,
  ImportedSuggestion,
  ImportPayload,
  Preparation,
  RecipeSuggestion,
  RecipeSuggestionStatus,
  RecipeSuggestParams,
  SuggestionPayload,
  SuggestionRequest,
} from '@family/shared';
import { asc, desc, eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '../client.js';
import { recipeSuggestion, recipeSuggestionRequest } from '../schema/food.js';

type RequestRow = typeof recipeSuggestionRequest.$inferSelect;
type SuggestionRow = typeof recipeSuggestion.$inferSelect;

/** API shape of a request: DB nulls of optional fields become absent, dates ISO strings. */
function toRequest(row: RequestRow): SuggestionRequest {
  return {
    id: row.id,
    slots: row.slots,
    times: row.times,
    tags: row.tags,
    hint: row.hint ?? undefined,
    status: row.status,
    error: row.error ?? undefined,
    requestedBy: row.requestedBy,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? undefined,
  };
}

/** The decision part of a suggestion row, whatever its origin. */
function decisionOf(row: SuggestionRow) {
  return {
    id: row.id,
    status: row.status,
    recipeId: row.recipeId ?? undefined,
    decidedBy: row.decidedBy ?? undefined,
    decidedAt: row.decidedAt?.toISOString() ?? undefined,
  };
}

/**
 * The stored payload, with `preparation: []` when it is from before the preparation (GLOSSARY: Подготовка, #283/#284)
 * and has none. Not left to a `.default([])` of the schema: the response serializer encodes, and encoding applies no
 * default.
 */
function payloadOf(row: SuggestionRow): SuggestionPayload | ImportPayload {
  const { preparation } = row.payload as { preparation?: Preparation };
  return { ...row.payload, preparation: preparation ?? [] };
}

/** A suggestion of a suggestion request; the row must have `request_id` (read by it). */
function toSuggestion(row: SuggestionRow): RecipeSuggestion {
  if (row.requestId === null) {
    throw new Error(
      `recipe_suggestion ${row.id} is not of a suggestion request`,
    );
  }
  return {
    ...decisionOf(row),
    origin: 'suggest',
    requestId: row.requestId,
    payload: payloadOf(row) as SuggestionPayload,
  };
}

/** The suggestion of an import; the row must have `import_request_id` (read by it). */
export function toImportedSuggestion(row: SuggestionRow): ImportedSuggestion {
  if (row.importRequestId === null) {
    throw new Error(`recipe_suggestion ${row.id} is not of an import`);
  }
  return {
    ...decisionOf(row),
    origin: 'import',
    importRequestId: row.importRequestId,
    payload: payloadOf(row) as ImportPayload,
  };
}

/** Either origin, told apart by which request the row points to (exactly one, by `recipe_suggestion_request_check`). */
function toAnySuggestion(row: SuggestionRow): AnyRecipeSuggestion {
  return row.importRequestId === null
    ? toSuggestion(row)
    : toImportedSuggestion(row);
}

/** A new `pending` request. */
export async function insertSuggestionRequest(
  db: DbExecutor,
  params: RecipeSuggestParams,
  requestedBy: string,
): Promise<SuggestionRequest> {
  const [row] = await db
    .insert(recipeSuggestionRequest)
    .values({
      slots: params.slots,
      times: params.times ?? [],
      tags: params.tags ?? [],
      hint: params.hint || null,
      requestedBy,
    })
    .returning();
  if (!row) {
    throw new Error('insert into recipe_suggestion_request returned no row');
  }
  return toRequest(row);
}

export async function findSuggestionRequest(
  db: DbExecutor,
  id: string,
): Promise<SuggestionRequest | undefined> {
  const [row] = await db
    .select()
    .from(recipeSuggestionRequest)
    .where(eq(recipeSuggestionRequest.id, id))
    .limit(1);
  return row && toRequest(row);
}

/** The latest requests, newest first. */
export async function listSuggestionRequests(
  db: DbExecutor,
  limit: number,
): Promise<SuggestionRequest[]> {
  const rows = await db
    .select()
    .from(recipeSuggestionRequest)
    .orderBy(desc(recipeSuggestionRequest.createdAt))
    .limit(limit);
  return rows.map(toRequest);
}

/** Stores the agent's suggestions of a request, numbered in its order. */
export async function insertSuggestions(
  db: DbExecutor,
  requestId: string,
  suggestions: SuggestionPayload[],
): Promise<void> {
  if (suggestions.length === 0) {
    return;
  }
  await db.insert(recipeSuggestion).values(
    suggestions.map((payload, position) => ({
      requestId,
      position,
      payload,
    })),
  );
}

export async function listSuggestions(
  db: DbExecutor,
  requestId: string,
): Promise<RecipeSuggestion[]> {
  const rows = await db
    .select()
    .from(recipeSuggestion)
    .where(eq(recipeSuggestion.requestId, requestId))
    .orderBy(asc(recipeSuggestion.position));
  return rows.map(toSuggestion);
}

/** The suggestion, its row locked until the transaction ends (`for update`), so two decisions cannot race. */
export async function lockSuggestion(
  db: DbExecutor,
  id: string,
): Promise<AnyRecipeSuggestion | undefined> {
  const [row] = await db
    .select()
    .from(recipeSuggestion)
    .where(eq(recipeSuggestion.id, id))
    .for('update')
    .limit(1);
  return row && toAnySuggestion(row);
}

/** Records the decision on a suggestion; returns it as stored. */
export async function decideSuggestion(
  db: DbExecutor,
  id: string,
  decision: {
    status: Exclude<RecipeSuggestionStatus, 'proposed'>;
    recipeId: string | null;
    decidedBy: string;
  },
): Promise<AnyRecipeSuggestion> {
  const [row] = await db
    .update(recipeSuggestion)
    .set({ ...decision, decidedAt: sql`now()` })
    .where(eq(recipeSuggestion.id, id))
    .returning();
  if (!row) {
    throw new Error('update of recipe_suggestion returned no row');
  }
  return toAnySuggestion(row);
}

/**
 * Clears the decision on a suggestion: it is `proposed` again, without who and when, and with `payload` when given;
 * returns it as stored.
 */
export async function undecideSuggestion(
  db: DbExecutor,
  id: string,
  payload?: SuggestionPayload | ImportPayload,
): Promise<AnyRecipeSuggestion> {
  const [row] = await db
    .update(recipeSuggestion)
    .set({
      status: 'proposed',
      recipeId: null,
      decidedBy: null,
      decidedAt: null,
      ...(payload === undefined ? {} : { payload }),
    })
    .where(eq(recipeSuggestion.id, id))
    .returning();
  if (!row) {
    throw new Error('update of recipe_suggestion returned no row');
  }
  return toAnySuggestion(row);
}
