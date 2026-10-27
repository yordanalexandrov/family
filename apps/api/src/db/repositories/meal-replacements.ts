import type { MealReplaceCandidate, MealReplaceRequest } from '@family/shared';
import { and, eq, inArray } from 'drizzle-orm';
import type { DbExecutor } from '../client.js';
import { recipe } from '../schema/food.js';
import { meal, mealReplaceRequest } from '../schema/menu.js';

type ReplacementRow = typeof mealReplaceRequest.$inferSelect;

/** API shape of a request: DB nulls of optional fields become absent, dates ISO strings. */
function toReplacement(row: ReplacementRow): MealReplaceRequest {
  return {
    id: row.id,
    mealId: row.mealId,
    status: row.status,
    error: row.error ?? undefined,
    candidates: row.candidates ?? undefined,
    requestedBy: row.requestedBy,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? undefined,
  };
}

/**
 * Holds the meal's row until the transaction ends, so that „no pending request“ still holds when the request is
 * inserted.
 */
export async function lockMeal(db: DbExecutor, mealId: string): Promise<void> {
  await db
    .select({ id: meal.id })
    .from(meal)
    .where(eq(meal.id, mealId))
    .for('update');
}

export async function hasPendingReplacement(
  db: DbExecutor,
  mealId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: mealReplaceRequest.id })
    .from(mealReplaceRequest)
    .where(
      and(
        eq(mealReplaceRequest.mealId, mealId),
        eq(mealReplaceRequest.status, 'pending'),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/** A new `pending` request. Refused by `meal_replace_request_pending_meal_key` when the meal has one. */
export async function insertReplacement(
  db: DbExecutor,
  mealId: string,
  requestedBy: string,
): Promise<MealReplaceRequest> {
  const [row] = await db
    .insert(mealReplaceRequest)
    .values({ mealId, requestedBy })
    .returning();
  if (!row) {
    throw new Error('insert into meal_replace_request returned no row');
  }
  return toReplacement(row);
}

export async function findReplacement(
  db: DbExecutor,
  id: string,
): Promise<MealReplaceRequest | undefined> {
  const [row] = await db
    .select()
    .from(mealReplaceRequest)
    .where(eq(mealReplaceRequest.id, id))
    .limit(1);
  return row && toReplacement(row);
}

/** The candidates of a `done` request, in the agent's order, with the title and time of their recipes. */
export async function setReplacementCandidates(
  db: DbExecutor,
  id: string,
  picks: { recipeId: string; why: string }[],
): Promise<void> {
  const recipes = await db
    .select({
      id: recipe.id,
      title: recipe.title,
      prepMinutes: recipe.prepMinutes,
    })
    .from(recipe)
    .where(
      inArray(
        recipe.id,
        picks.map((pick) => pick.recipeId),
      ),
    );
  const byId = new Map(recipes.map((row) => [row.id, row]));
  const candidates = picks.flatMap((pick): MealReplaceCandidate[] => {
    const found = byId.get(pick.recipeId);
    if (!found) {
      return [];
    }
    return [
      {
        recipeId: pick.recipeId,
        why: pick.why,
        title: found.title,
        ...(found.prepMinutes === null
          ? {}
          : { prepMinutes: found.prepMinutes }),
      },
    ];
  });
  await db
    .update(mealReplaceRequest)
    .set({ candidates })
    .where(eq(mealReplaceRequest.id, id));
}
