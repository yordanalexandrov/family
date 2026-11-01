import type { AskCookingQuestion, CookingQuestion } from '@family/shared';
import { eq } from 'drizzle-orm';
import type { DbExecutor } from '../client.js';
import { cookingQuestionRequest } from '../schema/food.js';

type QuestionRow = typeof cookingQuestionRequest.$inferSelect;

/** API shape of a question: DB nulls of optional fields become absent, dates ISO strings. */
function toCookingQuestion(row: QuestionRow): CookingQuestion {
  return {
    id: row.id,
    recipeId: row.recipeId,
    question: row.question,
    step: row.step,
    servings: row.servings,
    status: row.status,
    error: row.error ?? undefined,
    answer: row.answer ?? undefined,
    requestedBy: row.requestedBy,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? undefined,
  };
}

/** A new `pending` question for the recipe; `requestedBy` is `null` on the kiosk. */
export async function insertCookingQuestion(
  db: DbExecutor,
  recipeId: string,
  asked: AskCookingQuestion,
  requestedBy: string | null,
): Promise<CookingQuestion> {
  const [row] = await db
    .insert(cookingQuestionRequest)
    .values({
      recipeId,
      question: asked.question,
      step: asked.step,
      servings: asked.servings,
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

export async function setCookingAnswer(
  db: DbExecutor,
  id: string,
  answer: string,
): Promise<void> {
  await db
    .update(cookingQuestionRequest)
    .set({ answer })
    .where(eq(cookingQuestionRequest.id, id));
}
