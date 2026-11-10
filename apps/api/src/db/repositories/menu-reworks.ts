import type { MenuReworkRequest } from '@family/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { DbExecutor } from '../client.js';
import { menuReworkRequest } from '../schema/menu.js';

type ReworkRow = typeof menuReworkRequest.$inferSelect;

/** API shape of a rework: DB nulls of optional fields become absent, dates ISO strings. */
function toRework(row: ReworkRow): MenuReworkRequest {
  return {
    id: row.id,
    weekStart: row.weekStart,
    planId: row.planId,
    hint: row.hint ?? undefined,
    status: row.status,
    error: row.error ?? undefined,
    requestedBy: row.requestedBy,
    changed: row.changed ?? undefined,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? undefined,
  };
}

/**
 * A new `pending` rework of the plan, asked for `createdAt` (the app's clock: its days are classified by that date).
 * Refused by `menu_rework_request_pending_plan_key` when the plan has one.
 */
export async function insertRework(
  db: DbExecutor,
  values: {
    planId: string;
    weekStart: string;
    hint?: string;
    requestedBy: string;
    createdAt: Date;
  },
): Promise<MenuReworkRequest> {
  const [row] = await db
    .insert(menuReworkRequest)
    .values({ ...values, hint: values.hint || null })
    .returning();
  if (!row) {
    throw new Error('insert into menu_rework_request returned no row');
  }
  return toRework(row);
}

export async function findRework(
  db: DbExecutor,
  id: string,
): Promise<MenuReworkRequest | undefined> {
  const [row] = await db
    .select()
    .from(menuReworkRequest)
    .where(eq(menuReworkRequest.id, id))
    .limit(1);
  return row && toRework(row);
}

/** The week's newest rework, of any status. */
export async function findLatestRework(
  db: DbExecutor,
  weekStart: string,
): Promise<MenuReworkRequest | undefined> {
  const [row] = await db
    .select()
    .from(menuReworkRequest)
    .where(eq(menuReworkRequest.weekStart, weekStart))
    .orderBy(desc(menuReworkRequest.createdAt), desc(menuReworkRequest.id))
    .limit(1);
  return row && toRework(row);
}

/** Whether a rework of the plan is `pending`: the week is locked (GLOSSARY: Преработка на менюто). */
export async function hasPendingRework(
  db: DbExecutor,
  planId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: menuReworkRequest.id })
    .from(menuReworkRequest)
    .where(
      and(
        eq(menuReworkRequest.planId, planId),
        eq(menuReworkRequest.status, 'pending'),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/** How many meals a `done` rework changed. */
export async function setReworkChanged(
  db: DbExecutor,
  id: string,
  changed: number,
): Promise<void> {
  await db
    .update(menuReworkRequest)
    .set({ changed })
    .where(eq(menuReworkRequest.id, id));
}
