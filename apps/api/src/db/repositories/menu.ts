import type {
  Meal,
  MealComment,
  MealCommentKind,
  MealPlan,
  MealPlanSummary,
  MenuProposalRequest,
  Servings,
  Slot,
  Vote,
  VoteValue,
} from '@family/shared';
import {
  and,
  asc,
  between,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  ne,
  sql,
} from 'drizzle-orm';
import type { DbExecutor } from '../client.js';
import { recipe } from '../schema/food.js';
import {
  meal,
  mealComment,
  mealPlan,
  mealVote,
  menuProposalRequest,
} from '../schema/menu.js';

type PlanRow = typeof mealPlan.$inferSelect;
type CommentRow = typeof mealComment.$inferSelect;
type ProposalRow = typeof menuProposalRequest.$inferSelect;

function toPlanSummary(row: PlanRow): MealPlanSummary {
  return {
    id: row.id,
    weekStart: row.weekStart,
    summary: row.summary,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** API shape of a request: DB nulls of optional fields become absent, dates ISO strings. */
function toProposal(row: ProposalRow): MenuProposalRequest {
  return {
    id: row.id,
    weekStart: row.weekStart,
    hint: row.hint ?? undefined,
    status: row.status,
    error: row.error ?? undefined,
    trigger: row.trigger,
    requestedBy: row.requestedBy,
    planId: row.planId ?? undefined,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? undefined,
  };
}

/** A meal with the title and archive state of its recipe. */
const mealColumns = {
  id: meal.id,
  planId: meal.planId,
  date: meal.date,
  slot: meal.slot,
  recipeId: meal.recipeId,
  note: meal.note,
  cookUserId: meal.cookUserId,
  servings: meal.servings,
  why: meal.why,
  recipeTitle: recipe.title,
  recipeArchivedAt: recipe.archivedAt,
};

function selectMeals(db: DbExecutor) {
  return db
    .select(mealColumns)
    .from(meal)
    .leftJoin(recipe, eq(recipe.id, meal.recipeId));
}

type MealRow = Awaited<ReturnType<typeof selectMeals>>[number];

function toComment({ seq: _seq, createdAt, ...row }: CommentRow): MealComment {
  return { ...row, createdAt: createdAt.toISOString() };
}

/** Lines of a thread in the order they were written. */
const threadOrder = [asc(mealComment.createdAt), asc(mealComment.seq)];

interface Thread {
  lastComment?: MealComment;
  commentCount: number;
}

function toMeal(
  { recipeTitle, recipeArchivedAt, ...row }: MealRow,
  votes: Vote[],
  thread: Thread,
): Meal {
  return {
    ...row,
    votes,
    ...thread,
    recipe:
      row.recipeId !== null && recipeTitle !== null
        ? {
            title: recipeTitle,
            archivedAt: recipeArchivedAt?.toISOString() ?? null,
          }
        : null,
  };
}

/** The newest line and the number of lines of each meal's thread. */
async function threadsOf(
  db: DbExecutor,
  mealIds: string[],
): Promise<Map<string, Thread>> {
  const counts = await db
    .select({ mealId: mealComment.mealId, n: count() })
    .from(mealComment)
    .where(inArray(mealComment.mealId, mealIds))
    .groupBy(mealComment.mealId);
  const last = await db
    .selectDistinctOn([mealComment.mealId])
    .from(mealComment)
    .where(inArray(mealComment.mealId, mealIds))
    .orderBy(
      asc(mealComment.mealId),
      desc(mealComment.createdAt),
      desc(mealComment.seq),
    );
  const threads = new Map<string, Thread>();
  for (const { mealId, n } of counts) {
    threads.set(mealId, { commentCount: n });
  }
  for (const row of last) {
    threads.set(row.mealId, {
      commentCount: threads.get(row.mealId)?.commentCount ?? 0,
      lastComment: toComment(row),
    });
  }
  return threads;
}

/** The meals of `rows` with their votes, by user id, and the newest line of their thread. */
async function withVotes(db: DbExecutor, rows: MealRow[]): Promise<Meal[]> {
  if (rows.length === 0) {
    return [];
  }
  const threads = await threadsOf(
    db,
    rows.map((row) => row.id),
  );
  const votes = await db
    .select({
      mealId: mealVote.mealId,
      userId: mealVote.userId,
      value: mealVote.value,
    })
    .from(mealVote)
    .where(
      inArray(
        mealVote.mealId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(asc(mealVote.userId));
  return rows.map((row) =>
    toMeal(
      row,
      votes
        .filter((vote) => vote.mealId === row.id)
        .map(({ userId, value }) => ({ userId, value })),
      threads.get(row.id) ?? { commentCount: 0 },
    ),
  );
}

async function withMeals(db: DbExecutor, row: PlanRow): Promise<MealPlan> {
  const meals = await selectMeals(db)
    .where(eq(meal.planId, row.id))
    .orderBy(asc(meal.date), asc(meal.slot));
  return { ...toPlanSummary(row), meals: await withVotes(db, meals) };
}

/**
 * Serializes the writes that take a week (an empty plan, a proposal) until the transaction ends, so that the checks
 * „no plan“ and „no pending proposal“ hold when the row is inserted.
 */
export async function lockWeek(
  db: DbExecutor,
  weekStart: string,
): Promise<void> {
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`menu_week:${weekStart}`}))`,
  );
}

/** The plan of the week with its meals by date. */
export async function findPlanByWeek(
  db: DbExecutor,
  weekStart: string,
): Promise<MealPlan | undefined> {
  const [row] = await db
    .select()
    .from(mealPlan)
    .where(eq(mealPlan.weekStart, weekStart))
    .limit(1);
  return row && withMeals(db, row);
}

export async function findPlanSummary(
  db: DbExecutor,
  id: string,
): Promise<MealPlanSummary | undefined> {
  const [row] = await db
    .select()
    .from(mealPlan)
    .where(eq(mealPlan.id, id))
    .limit(1);
  return row && toPlanSummary(row);
}

/** Plans whose week starts between `from` and `to` (both included), oldest first. */
export async function listPlans(
  db: DbExecutor,
  from: string,
  to: string,
): Promise<MealPlanSummary[]> {
  const rows = await db
    .select()
    .from(mealPlan)
    .where(between(mealPlan.weekStart, from, to))
    .orderBy(asc(mealPlan.weekStart));
  return rows.map(toPlanSummary);
}

export interface NewMeal {
  date: string;
  slot: Slot;
  recipeId: string | null;
  why: string | null;
  servings: Servings;
}

/** A plan with its meals; run it in a transaction. Refused by `meal_plan_week_start_unique` for a second plan. */
export async function insertPlan(
  db: DbExecutor,
  plan: {
    weekStart: string;
    summary: string | null;
    createdBy: string | null;
  },
  meals: NewMeal[],
): Promise<MealPlan> {
  const [row] = await db.insert(mealPlan).values(plan).returning();
  if (!row) {
    throw new Error('insert into meal_plan returned no row');
  }
  await db
    .insert(meal)
    .values(meals.map((entry) => ({ ...entry, planId: row.id })));
  return withMeals(db, row);
}

/** `false` when there is no such plan. Its meals go with it (`cascade`). */
export async function deletePlan(db: DbExecutor, id: string): Promise<boolean> {
  const rows = await db
    .delete(mealPlan)
    .where(eq(mealPlan.id, id))
    .returning({ id: mealPlan.id });
  return rows.length > 0;
}

export async function findMeal(
  db: DbExecutor,
  id: string,
): Promise<Meal | undefined> {
  const rows = await selectMeals(db).where(eq(meal.id, id)).limit(1);
  return (await withVotes(db, rows))[0];
}

/** The meal of a day and slot in whichever plan holds that date. */
export async function findMealOn(
  db: DbExecutor,
  date: string,
  slot: Slot,
): Promise<Meal | undefined> {
  const rows = await selectMeals(db)
    .where(and(eq(meal.date, date), eq(meal.slot, slot)))
    .limit(1);
  return (await withVotes(db, rows))[0];
}

/** Writes the given columns of a meal and sets `updated_at` of its plan to `at`. */
export async function updateMeal(
  db: DbExecutor,
  id: string,
  planId: string,
  values: Partial<
    Pick<
      typeof meal.$inferInsert,
      'recipeId' | 'note' | 'cookUserId' | 'servings' | 'why'
    >
  >,
  at: Date,
): Promise<void> {
  if (Object.keys(values).length > 0) {
    await db.update(meal).set(values).where(eq(meal.id, id));
  }
  await db
    .update(mealPlan)
    .set({ updatedAt: at })
    .where(eq(mealPlan.id, planId));
}

/** Puts the vote of `userId` for a meal, replacing the one it had. */
/**
 * Swaps the days of two meals of one plan and slot. `(plan_id, date, slot)` is unique and checked row by row (not
 * deferrable), so a one-statement swap can collide halfway. A temporary value instead of a deferrable constraint (no
 * migration): `a` first parks 100 years back, a day no meal of its plan has, then `b` takes `a`'s day and `a` `b`'s.
 */
export async function swapMealDates(
  db: DbExecutor,
  a: Meal,
  b: Meal,
  at: Date,
): Promise<void> {
  await db
    .update(meal)
    .set({ date: sql`(${meal.date} - interval '100 years')::date` })
    .where(eq(meal.id, a.id));
  await db.update(meal).set({ date: a.date }).where(eq(meal.id, b.id));
  await db.update(meal).set({ date: b.date }).where(eq(meal.id, a.id));
  await db
    .update(mealPlan)
    .set({ updatedAt: at })
    .where(eq(mealPlan.id, a.planId));
}

export async function upsertVote(
  db: DbExecutor,
  mealId: string,
  userId: string,
  value: VoteValue,
  at: Date,
): Promise<void> {
  await db
    .insert(mealVote)
    .values({ mealId, userId, value, updatedAt: at })
    .onConflictDoUpdate({
      target: [mealVote.mealId, mealVote.userId],
      set: { value, updatedAt: at },
    });
}

export async function deleteVote(
  db: DbExecutor,
  mealId: string,
  userId: string,
): Promise<void> {
  await db
    .delete(mealVote)
    .where(and(eq(mealVote.mealId, mealId), eq(mealVote.userId, userId)));
}

/** Drops the votes of everyone but `userId` for a meal. */
export async function deleteOtherVotes(
  db: DbExecutor,
  mealId: string,
  userId: string,
): Promise<void> {
  await db
    .delete(mealVote)
    .where(and(eq(mealVote.mealId, mealId), ne(mealVote.userId, userId)));
}

/** The thread of a meal (GLOSSARY: Разговор) in the order it was written. */
export async function listComments(
  db: DbExecutor,
  mealId: string,
): Promise<MealComment[]> {
  const rows = await db
    .select()
    .from(mealComment)
    .where(eq(mealComment.mealId, mealId))
    .orderBy(...threadOrder);
  return rows.map(toComment);
}

export async function findComment(
  db: DbExecutor,
  id: string,
): Promise<MealComment | undefined> {
  const [row] = await db
    .select()
    .from(mealComment)
    .where(eq(mealComment.id, id))
    .limit(1);
  return row && toComment(row);
}

/** A line of a meal's thread, written at `at`. */
export async function insertComment(
  db: DbExecutor,
  line: {
    mealId: string;
    kind: MealCommentKind;
    authorUserId: string;
    body: string;
  },
  at: Date,
): Promise<MealComment> {
  const [row] = await db
    .insert(mealComment)
    .values({ ...line, createdAt: at })
    .returning();
  if (!row) {
    throw new Error('insert into meal_comment returned no row');
  }
  return toComment(row);
}

export async function deleteComment(db: DbExecutor, id: string): Promise<void> {
  await db.delete(mealComment).where(eq(mealComment.id, id));
}

/** Distinct recipes of the meals in the plans of the given weeks. */
export async function listRecipeIdsOfWeeks(
  db: DbExecutor,
  weekStarts: string[],
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ recipeId: meal.recipeId })
    .from(meal)
    .innerJoin(mealPlan, eq(mealPlan.id, meal.planId))
    .where(
      and(inArray(mealPlan.weekStart, weekStarts), isNotNull(meal.recipeId)),
    )
    .orderBy(asc(meal.recipeId));
  return rows.flatMap((row) => (row.recipeId ? [row.recipeId] : []));
}

/**
 * A new `pending` proposal: by a user, or by the cron (`requestedBy` `null`, trigger `schedule`). Refused by
 * `menu_proposal_request_pending_week_key` when the week has one.
 */
export async function insertProposal(
  db: DbExecutor,
  params: { weekStart: string; hint?: string },
  requestedBy: string | null,
): Promise<MenuProposalRequest> {
  const [row] = await db
    .insert(menuProposalRequest)
    .values({
      weekStart: params.weekStart,
      hint: params.hint || null,
      trigger: requestedBy === null ? 'schedule' : 'user',
      requestedBy,
    })
    .returning();
  if (!row) {
    throw new Error('insert into menu_proposal_request returned no row');
  }
  return toProposal(row);
}

export async function findProposal(
  db: DbExecutor,
  id: string,
): Promise<MenuProposalRequest | undefined> {
  const [row] = await db
    .select()
    .from(menuProposalRequest)
    .where(eq(menuProposalRequest.id, id))
    .limit(1);
  return row && toProposal(row);
}

/** The proposals of the week, newest first. */
export async function listProposalsOfWeek(
  db: DbExecutor,
  weekStart: string,
): Promise<MenuProposalRequest[]> {
  const rows = await db
    .select()
    .from(menuProposalRequest)
    .where(eq(menuProposalRequest.weekStart, weekStart))
    .orderBy(desc(menuProposalRequest.createdAt), desc(menuProposalRequest.id));
  return rows.map(toProposal);
}

export async function hasPendingProposal(
  db: DbExecutor,
  weekStart: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: menuProposalRequest.id })
    .from(menuProposalRequest)
    .where(
      and(
        eq(menuProposalRequest.weekStart, weekStart),
        eq(menuProposalRequest.status, 'pending'),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/** The plan a `done` proposal made. */
export async function setProposalPlan(
  db: DbExecutor,
  id: string,
  planId: string,
): Promise<void> {
  await db
    .update(menuProposalRequest)
    .set({ planId })
    .where(eq(menuProposalRequest.id, id));
}
