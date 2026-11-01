import type {
  OpenRevision,
  RecipeRevision,
  RecipeRevisionRequest,
  RevisionDecision,
} from '@family/shared';
import {
  and,
  asc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import type { DbExecutor } from '../client.js';
import { recipe, recipeRevisionRequest } from '../schema/food.js';

/**
 * The recipe was saved after the revision was asked for (`base_updated_at`). The base went through a JS `Date`, so the
 * recipe's time is compared to the millisecond.
 */
const stale = sql<boolean>`exists (select 1 from ${recipe} where ${recipe.id} = ${recipeRevisionRequest.recipeId} and date_trunc('milliseconds', ${recipe.updatedAt}) > ${recipeRevisionRequest.baseUpdatedAt})`;

/** The columns of a revision and whether it is stale, for `select` and `returning`. */
const revisionColumns = {
  ...getTableColumns(recipeRevisionRequest),
  stale,
};

type RevisionRow = typeof recipeRevisionRequest.$inferSelect & {
  stale: boolean;
};

/** API shape of a revision: DB nulls of optional fields become absent, dates ISO strings. */
function toRevisionRequest(row: RevisionRow): RecipeRevisionRequest {
  return {
    id: row.id,
    recipeId: row.recipeId,
    instruction: row.instruction,
    status: row.status,
    error: row.error ?? undefined,
    revision: row.revision ?? undefined,
    noResults: row.noResults ?? undefined,
    decision: row.decision ?? undefined,
    requestedBy: row.requestedBy,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? undefined,
    stale: row.stale,
  };
}

/**
 * GLOSSARY: Поправка на рецепта. The open revision is `pending`, or `done` with a revised recipe, and not decided;
 * `no_results` and `failed` are not open.
 */
const isOpen: SQL = and(
  isNull(recipeRevisionRequest.decision),
  or(
    eq(recipeRevisionRequest.status, 'pending'),
    and(
      eq(recipeRevisionRequest.status, 'done'),
      isNotNull(recipeRevisionRequest.revision),
    ),
  ),
) as SQL;

/** The open revision of each of the recipes that has one, by recipe id. */
export async function findOpenRevisions(
  db: DbExecutor,
  recipeIds: readonly string[],
): Promise<Map<string, OpenRevision>> {
  if (recipeIds.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({
      id: recipeRevisionRequest.id,
      recipeId: recipeRevisionRequest.recipeId,
      status: recipeRevisionRequest.status,
    })
    .from(recipeRevisionRequest)
    .where(and(inArray(recipeRevisionRequest.recipeId, [...recipeIds]), isOpen))
    .orderBy(asc(recipeRevisionRequest.createdAt));
  return new Map(
    rows.flatMap(({ id, recipeId, status }) =>
      status === 'pending' || status === 'done'
        ? [[recipeId, { id, status }] as const]
        : [],
    ),
  );
}

/** Holds the recipe's row until the transaction ends; answers when it was last saved, or `undefined` for none. */
export async function lockRecipeUpdatedAt(
  db: DbExecutor,
  recipeId: string,
): Promise<Date | undefined> {
  const [row] = await db
    .select({ updatedAt: recipe.updatedAt })
    .from(recipe)
    .where(eq(recipe.id, recipeId))
    .for('update');
  return row?.updatedAt;
}

export async function insertRevisionRequest(
  db: DbExecutor,
  values: {
    recipeId: string;
    instruction: string;
    requestedBy: string | null;
    baseUpdatedAt: Date;
  },
): Promise<RecipeRevisionRequest> {
  const [row] = await db
    .insert(recipeRevisionRequest)
    .values(values)
    .returning(revisionColumns);
  if (!row) {
    throw new Error('insert into recipe_revision_request returned no row');
  }
  return toRevisionRequest(row);
}

export async function findRevisionRequest(
  db: DbExecutor,
  id: string,
): Promise<RecipeRevisionRequest | undefined> {
  const [row] = await db
    .select(revisionColumns)
    .from(recipeRevisionRequest)
    .where(eq(recipeRevisionRequest.id, id))
    .limit(1);
  return row && toRevisionRequest(row);
}

/** The revision, its row held until the transaction ends, so that a decision on it is the only one. */
export async function lockRevisionRequest(
  db: DbExecutor,
  id: string,
): Promise<RecipeRevisionRequest | undefined> {
  const [row] = await db
    .select(revisionColumns)
    .from(recipeRevisionRequest)
    .where(eq(recipeRevisionRequest.id, id))
    .for('update');
  return row && toRevisionRequest(row);
}

export async function setRevision(
  db: DbExecutor,
  id: string,
  revision: RecipeRevision,
): Promise<void> {
  await db
    .update(recipeRevisionRequest)
    .set({ revision })
    .where(eq(recipeRevisionRequest.id, id));
}

export async function setRevisionNoResults(
  db: DbExecutor,
  id: string,
  reason: string,
): Promise<void> {
  await db
    .update(recipeRevisionRequest)
    .set({ noResults: reason })
    .where(eq(recipeRevisionRequest.id, id));
}

export async function decideRevisionRequest(
  db: DbExecutor,
  id: string,
  decision: RevisionDecision,
  decidedBy: string | null,
): Promise<RecipeRevisionRequest> {
  const [row] = await db
    .update(recipeRevisionRequest)
    .set({ decision, decidedBy, decidedAt: new Date() })
    .where(eq(recipeRevisionRequest.id, id))
    .returning(revisionColumns);
  if (!row) {
    throw new Error(`recipe_revision_request ${id} vanished`);
  }
  return toRevisionRequest(row);
}
