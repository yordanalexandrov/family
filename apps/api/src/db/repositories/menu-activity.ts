import type { DateKey } from '@family/shared';
import { and, eq, inArray, lte, max, ne, sql } from 'drizzle-orm';
import type { DbExecutor } from '../client.js';
import {
  type MenuActivityKind,
  menuActivity,
} from '../schema/notifications.js';
import { user } from '../schema/user.js';

export type { MenuActivityKind };

/** One action on the menu of a week, as it is recorded: on which meal and day, and what was done, without who. */
export interface MenuAction {
  kind: MenuActivityKind;
  mealId: string;
  date: DateKey;
  /** What was done, after the name of who did it: „гласува за „Мусака““. */
  text: string;
}

/** One gathered action of someone else on a week, for the person to be told. */
export interface MenuActivityAction extends MenuAction {
  actorUserId: string;
}

/** The gathered actions of others on one week, for one person, in the order they were done. */
export interface MenuActivity {
  weekStart: DateKey;
  recipientUserId: string;
  actions: MenuActivityAction[];
}

/**
 * Records one action of `actorUserId` on the menu of `weekStart` for every other person (never Рецептурко, ADR-0014),
 * at `at`; in the transaction of the action. The menu service (`services/menu.ts`) calls it for a vote put, a comment
 * written and a changed meal: its recipe, or the note of a meal without one (by hand or from „Предложи друго“) or its
 * day (a swap).
 */
export async function addMenuActivity(
  db: DbExecutor,
  weekStart: string,
  actorUserId: string,
  action: MenuAction,
  at: Date,
): Promise<void> {
  // The notification is about people: an action of Рецептурко is not told (ADR-0014).
  const [actor] = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, actorUserId));
  if (actor?.role === 'app') {
    return;
  }
  const others = await db
    .select({ id: user.id })
    .from(user)
    .where(and(ne(user.id, actorUserId), ne(user.role, 'app')));
  if (others.length === 0) {
    return;
  }
  await db.insert(menuActivity).values(
    others.map(({ id }) => ({
      weekStart,
      recipientUserId: id,
      actorUserId,
      ...action,
      at,
    })),
  );
}

/**
 * Deletes and answers the actions of each week and person whose last action is at or before `quietSince`, in one
 * statement, so an action that comes meanwhile stays for the next time instead of being lost.
 */
export async function takeQuietMenuActivity(
  db: DbExecutor,
  quietSince: Date,
): Promise<MenuActivity[]> {
  const quiet = db
    .select({
      weekStart: menuActivity.weekStart,
      recipientUserId: menuActivity.recipientUserId,
    })
    .from(menuActivity)
    .groupBy(menuActivity.weekStart, menuActivity.recipientUserId)
    .having(lte(max(menuActivity.at), quietSince));
  const taken = await db
    .delete(menuActivity)
    .where(
      inArray(
        sql`(${menuActivity.weekStart}, ${menuActivity.recipientUserId})`,
        quiet,
      ),
    )
    .returning();
  const gathered = new Map<string, MenuActivity>();
  for (const row of taken.sort((a, b) => a.seq - b.seq)) {
    const key = `${row.weekStart} ${row.recipientUserId}`;
    const activity = gathered.get(key) ?? {
      weekStart: row.weekStart,
      recipientUserId: row.recipientUserId,
      actions: [],
    };
    activity.actions.push({
      actorUserId: row.actorUserId,
      kind: row.kind,
      mealId: row.mealId,
      date: row.date,
      text: row.text,
    });
    gathered.set(key, activity);
  }
  return [...gathered.values()];
}
