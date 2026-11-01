import { randomUUID } from 'node:crypto';
import {
  type AppliedCookingChange,
  type AskCookingQuestion,
  type CookingChange,
  type CookingQuestion,
  cookingChangeSchema,
} from '@family/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { DbExecutor } from '../client.js';
import { cookingQuestionRequest } from '../schema/food.js';

type QuestionRow = typeof cookingQuestionRequest.$inferSelect;

/**
 * API shape of a question: DB nulls of optional fields become absent, dates ISO strings; the change as the schema reads
 * it (one stored before the steps has none).
 */
function toCookingQuestion(row: QuestionRow): CookingQuestion {
  return {
    id: row.id,
    recipeId: row.recipeId,
    question: row.question,
    step: row.step,
    servings: row.servings,
    follows: row.followsId ?? undefined,
    status: row.status,
    error: row.error ?? undefined,
    answer: row.answer ?? undefined,
    change: row.change ? cookingChangeSchema.parse(row.change) : undefined,
    requestedBy: row.requestedBy,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? undefined,
  };
}

/** A question as it is stored: with the chain it belongs to and the questions whose changes were applied. */
export interface StoredCookingQuestion extends CookingQuestion {
  chainId: string;
  appliedIds: string[];
}

/**
 * A new `pending` question for the recipe; `requestedBy` is `null` on the kiosk. `chainId` is the chain of the question
 * it follows; without one it starts its own chain.
 */
export async function insertCookingQuestion(
  db: DbExecutor,
  recipeId: string,
  asked: AskCookingQuestion,
  requestedBy: string | null,
  chainId?: string,
): Promise<CookingQuestion> {
  const id = randomUUID();
  const [row] = await db
    .insert(cookingQuestionRequest)
    .values({
      id,
      chainId: chainId ?? id,
      followsId: asked.follows ?? null,
      recipeId,
      question: asked.question,
      step: asked.step,
      servings: asked.servings,
      appliedIds: asked.applied,
      requestedBy,
    })
    .returning();
  if (!row) {
    throw new Error('insert into cooking_question_request returned no row');
  }
  return toCookingQuestion(row);
}

export async function findCookingQuestion(
  db: DbExecutor,
  id: string,
): Promise<CookingQuestion | undefined> {
  const [row] = await db
    .select()
    .from(cookingQuestionRequest)
    .where(eq(cookingQuestionRequest.id, id))
    .limit(1);
  return row && toCookingQuestion(row);
}

/** The answer and its cooking change, if it brings one. */
export async function setCookingAnswer(
  db: DbExecutor,
  id: string,
  answer: string,
  change: CookingChange | undefined,
): Promise<void> {
  await db
    .update(cookingQuestionRequest)
    .set({ answer, change: change ?? null })
    .where(eq(cookingQuestionRequest.id, id));
}

/**
 * The changes of the questions `ids` of the recipe, in the order of `ids`, each with the servings it was asked for.
 * `undefined` when one of them is not a question of the recipe with a change.
 */
export async function findAppliedChanges(
  db: DbExecutor,
  recipeId: string,
  ids: readonly string[],
): Promise<AppliedCookingChange[] | undefined> {
  if (ids.length === 0) {
    return [];
  }
  const rows = await db
    .select({
      id: cookingQuestionRequest.id,
      change: cookingQuestionRequest.change,
      servings: cookingQuestionRequest.servings,
    })
    .from(cookingQuestionRequest)
    .where(
      and(
        eq(cookingQuestionRequest.recipeId, recipeId),
        inArray(cookingQuestionRequest.id, [...ids]),
      ),
    );
  const byId = new Map(rows.map((row) => [row.id, row]));
  const applied: AppliedCookingChange[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row?.change) {
      return undefined;
    }
    applied.push({
      change: cookingChangeSchema.parse(row.change),
      servings: row.servings,
    });
  }
  return applied;
}

/** The question with the chain it belongs to; for checking a `follows`. */
export async function findStoredCookingQuestion(
  db: DbExecutor,
  id: string,
): Promise<StoredCookingQuestion | undefined> {
  const [row] = await db
    .select()
    .from(cookingQuestionRequest)
    .where(eq(cookingQuestionRequest.id, id))
    .limit(1);
  return (
    row && {
      ...toCookingQuestion(row),
      chainId: row.chainId,
      appliedIds: row.appliedIds,
    }
  );
}

/** Holds the chain until the transaction ends, so two questions cannot both wait in it. */
export async function lockCookingChain(
  db: DbExecutor,
  chainId: string,
): Promise<void> {
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`cooking_chain:${chainId}`}))`,
  );
}

export async function hasPendingInChain(
  db: DbExecutor,
  chainId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: cookingQuestionRequest.id })
    .from(cookingQuestionRequest)
    .where(
      and(
        eq(cookingQuestionRequest.chainId, chainId),
        eq(cookingQuestionRequest.status, 'pending'),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * The questions before `question` in its chain, by `follows`, at most `limit` of those with an answer, oldest first.
 * One without an answer (a failed one) is passed over.
 */
export async function answeredBefore(
  db: DbExecutor,
  question: CookingQuestion,
  limit: number,
): Promise<{ question: string; answer: string }[]> {
  const found: { question: string; answer: string }[] = [];
  const seen = new Set<string>([question.id]);
  let next = question.follows;
  while (next !== undefined && found.length < limit && !seen.has(next)) {
    seen.add(next);
    const earlier = await findCookingQuestion(db, next);
    if (!earlier) {
      break;
    }
    if (earlier.answer !== undefined) {
      found.push({ question: earlier.question, answer: earlier.answer });
    }
    next = earlier.follows;
  }
  return found.reverse();
}
