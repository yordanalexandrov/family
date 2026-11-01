import type {
  RecipeRevision,
  RecipeRevisionRequest,
  RevisableRecipe,
  RevisionDecision,
} from '@family/shared';
import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';
import type { DbExecutor } from '../client.js';
import { recipe, recipeRevisionRequest } from '../schema/food.js';

type RevisionRow = typeof recipeRevisionRequest.$inferSelect;

/** API shape of a revision: DB nulls of optional fields become absent, dates ISO strings. */
function toRevisionRequest(row: RevisionRow): RecipeRevisionRequest {
  return {
    id: row.id,
    recipeId: row.recipeId ?? undefined,
    suggestionId: row.suggestionId ?? undefined,
    instruction: row.instruction,
    status: row.status,
    error: row.error ?? undefined,
    revision: row.revision ?? undefined,
    noResults: row.noResults ?? undefined,
    decision: row.decision ?? undefined,
    requestedBy: row.requestedBy,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? undefined,
  };
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
  values: { instruction: string; requestedBy: string | null } & (
    | { recipeId: string; baseUpdatedAt: Date }
    | { suggestionId: string; baseRecipe: RevisableRecipe }
  ),
): Promise<RecipeRevisionRequest> {
  const [row] = await db
    .insert(recipeRevisionRequest)
    .values(values)
    .returning();
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
    .select()
    .from(recipeRevisionRequest)
    .where(eq(recipeRevisionRequest.id, id))
    .limit(1);
  return row && toRevisionRequest(row);
}

/** The review form's recipe a revision of a suggestion was asked for; `undefined` for a revision of a recipe. */
export async function findRevisionBaseRecipe(
  db: DbExecutor,
  id: string,
): Promise<RevisableRecipe | undefined> {
  const [row] = await db
    .select({ baseRecipe: recipeRevisionRequest.baseRecipe })
    .from(recipeRevisionRequest)
    .where(eq(recipeRevisionRequest.id, id))
    .limit(1);
  return row?.baseRecipe ?? undefined;
}

/** The id of the suggestion's open revision (still `pending`, or `done` with a revision and no decision), if any. */
export async function findOpenSuggestionRevision(
  db: DbExecutor,
  suggestionId: string,
): Promise<string | undefined> {
  const [row] = await db
    .select({ id: recipeRevisionRequest.id })
    .from(recipeRevisionRequest)
    .where(
      and(
        eq(recipeRevisionRequest.suggestionId, suggestionId),
        isNull(recipeRevisionRequest.decision),
        or(
          eq(recipeRevisionRequest.status, 'pending'),
          and(
            eq(recipeRevisionRequest.status, 'done'),
            isNotNull(recipeRevisionRequest.revision),
          ),
        ),
      ),
    )
    .limit(1);
  return row?.id;
}

/** The revision, its row held until the transaction ends, so that a decision on it is the only one. */
export async function lockRevisionRequest(
  db: DbExecutor,
  id: string,
): Promise<RecipeRevisionRequest | undefined> {
  const [row] = await db
    .select()
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
    .returning();
  if (!row) {
    throw new Error(`recipe_revision_request ${id} vanished`);
  }
  return toRevisionRequest(row);
}
