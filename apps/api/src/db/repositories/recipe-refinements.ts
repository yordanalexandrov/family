import type { RecipeRefinement, RecipeRefineRequest } from '@family/shared';
import { and, eq } from 'drizzle-orm';
import type { DbExecutor } from '../client.js';
import { recipe, recipeRefineRequest } from '../schema/food.js';

type RefineRow = typeof recipeRefineRequest.$inferSelect;

/** API shape of a request: DB nulls of optional fields become absent, dates ISO strings. */
function toRefineRequest(row: RefineRow): RecipeRefineRequest {
  return {
    id: row.id,
    recipeId: row.recipeId,
    status: row.status,
    error: row.error ?? undefined,
    refinement: row.refinement ?? undefined,
    noResults: row.noResults ?? undefined,
    requestedBy: row.requestedBy,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? undefined,
  };
}

/**
 * Holds the recipe's row until the transaction ends, so that „no pending request“ still holds when the request is
 * inserted. Answers whether the recipe exists.
 */
export async function lockRecipe(
  db: DbExecutor,
  recipeId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: recipe.id })
    .from(recipe)
    .where(eq(recipe.id, recipeId))
    .for('update');
  return rows.length > 0;
}

export async function hasPendingRefinement(
  db: DbExecutor,
  recipeId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: recipeRefineRequest.id })
    .from(recipeRefineRequest)
    .where(
      and(
        eq(recipeRefineRequest.recipeId, recipeId),
        eq(recipeRefineRequest.status, 'pending'),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/** A new `pending` request. Refused by `recipe_refine_request_pending_recipe_key` when the recipe has one. */
export async function insertRefineRequest(
  db: DbExecutor,
  recipeId: string,
  requestedBy: string,
): Promise<RecipeRefineRequest> {
  const [row] = await db
    .insert(recipeRefineRequest)
    .values({ recipeId, requestedBy })
    .returning();
  if (!row) {
    throw new Error('insert into recipe_refine_request returned no row');
  }
  return toRefineRequest(row);
}

export async function findRefineRequest(
  db: DbExecutor,
  id: string,
): Promise<RecipeRefineRequest | undefined> {
  const [row] = await db
    .select()
    .from(recipeRefineRequest)
    .where(eq(recipeRefineRequest.id, id))
    .limit(1);
  return row && toRefineRequest(row);
}

export async function setRefinement(
  db: DbExecutor,
  id: string,
  refinement: RecipeRefinement,
): Promise<void> {
  await db
    .update(recipeRefineRequest)
    .set({ refinement })
    .where(eq(recipeRefineRequest.id, id));
}

export async function setRefineNoResults(
  db: DbExecutor,
  id: string,
  reason: string,
): Promise<void> {
  await db
    .update(recipeRefineRequest)
    .set({ noResults: reason })
    .where(eq(recipeRefineRequest.id, id));
}
