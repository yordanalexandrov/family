import type {
  RecipeSuggestion,
  RecipeSuggestionStatus,
  RecipeSuggestParams,
  Suggestion,
  SuggestionRequest,
  SuggestionRequestStatus,
} from '@family/shared';
import { and, asc, desc, eq, lt, sql } from 'drizzle-orm';
import type { DbExecutor } from '../client.js';
import { recipeSuggestion, recipeSuggestionRequest } from '../schema/food.js';

type RequestRow = typeof recipeSuggestionRequest.$inferSelect;
type SuggestionRow = typeof recipeSuggestion.$inferSelect;

/** API shape of a request: DB nulls of optional fields become absent, dates ISO strings. */
function toRequest(row: RequestRow): SuggestionRequest {
  return {
    id: row.id,
    slot: row.slot,
    maxMinutes: row.maxMinutes ?? undefined,
    tags: row.tags,
    hint: row.hint ?? undefined,
    status: row.status,
    error: row.error ?? undefined,
    requestedBy: row.requestedBy,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? undefined,
  };
}

function toSuggestion(row: SuggestionRow): RecipeSuggestion {
  return {
    id: row.id,
    requestId: row.requestId,
    payload: row.payload,
    status: row.status,
    recipeId: row.recipeId ?? undefined,
    decidedBy: row.decidedBy ?? undefined,
    decidedAt: row.decidedAt?.toISOString() ?? undefined,
  };
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
      slot: params.slot,
      maxMinutes: params.maxMinutes ?? null,
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

/** Sets the final status (`done` or `failed` with a short error code) and `finished_at`. */
export async function finishSuggestionRequest(
  db: DbExecutor,
  id: string,
  status: Exclude<SuggestionRequestStatus, 'pending'>,
  error: string | null,
): Promise<void> {
  await db
    .update(recipeSuggestionRequest)
    .set({ status, error, finishedAt: new Date() })
    .where(eq(recipeSuggestionRequest.id, id));
}

/** Requests still `pending` that were created before `cutoff` become `failed` with `error`; returns how many. */
export async function failPendingRequestsBefore(
  db: DbExecutor,
  cutoff: Date,
  error: string,
): Promise<number> {
  const rows = await db
    .update(recipeSuggestionRequest)
    .set({ status: 'failed', error, finishedAt: new Date() })
    .where(
      and(
        eq(recipeSuggestionRequest.status, 'pending'),
        lt(recipeSuggestionRequest.createdAt, cutoff),
      ),
    )
    .returning({ id: recipeSuggestionRequest.id });
  return rows.length;
}

/** Stores the agent's suggestions of a request, numbered in its order. */
export async function insertSuggestions(
  db: DbExecutor,
  requestId: string,
  suggestions: Suggestion[],
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
): Promise<RecipeSuggestion | undefined> {
  const [row] = await db
    .select()
    .from(recipeSuggestion)
    .where(eq(recipeSuggestion.id, id))
    .for('update')
    .limit(1);
  return row && toSuggestion(row);
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
): Promise<RecipeSuggestion> {
  const [row] = await db
    .update(recipeSuggestion)
    .set({ ...decision, decidedAt: sql`now()` })
    .where(eq(recipeSuggestion.id, id))
    .returning();
  if (!row) {
    throw new Error('update of recipe_suggestion returned no row');
  }
  return toSuggestion(row);
}
