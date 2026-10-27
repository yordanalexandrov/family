import { lte, ne, sql } from 'drizzle-orm';
import type { DbExecutor } from '../client.js';
import { menuActivity } from '../schema/notifications.js';
import { user } from '../schema/user.js';

/** What a person did on the menu of a week, as the others are told: a vote, a comment or a changed meal. */
export type MenuActivityKind = 'votes' | 'comments' | 'swaps';

/** The gathered actions of others on one week, for one person. */
export interface MenuActivity {
  weekStart: string;
  recipientUserId: string;
  votes: number;
  comments: number;
  swaps: number;
}

/**
 * Counts one action of `actorUserId` on the menu of `weekStart` for every other person, and makes `at` the last one;
 * in the transaction of the action. The menu service (`services/menu.ts`) calls it for a vote put, a comment written
 * and a changed meal: its recipe or note (by hand or from „Предложи друго“) or its day (a swap).
 */
export async function addMenuActivity(
  db: DbExecutor,
  weekStart: string,
  actorUserId: string,
  kind: MenuActivityKind,
  at: Date,
): Promise<void> {
  const others = await db
    .select({ id: user.id })
    .from(user)
    .where(ne(user.id, actorUserId));
  if (others.length === 0) {
    return;
  }
  await db
    .insert(menuActivity)
    .values(
      others.map(({ id }) => ({
        weekStart,
        recipientUserId: id,
        [kind]: 1,
        lastAt: at,
      })),
    )
    .onConflictDoUpdate({
      target: [menuActivity.weekStart, menuActivity.recipientUserId],
      set: {
        [kind]: sql`${menuActivity[kind]} + 1`,
        lastAt: at,
      },
    });
}

/**
 * Deletes and answers the activity whose last action is at or before `quietSince`, in one statement, so an action
 * that comes meanwhile starts a new row instead of being lost.
 */
export async function takeQuietMenuActivity(
  db: DbExecutor,
  quietSince: Date,
): Promise<MenuActivity[]> {
  return db
    .delete(menuActivity)
    .where(lte(menuActivity.lastAt, quietSince))
    .returning({
      weekStart: menuActivity.weekStart,
      recipientUserId: menuActivity.recipientUserId,
      votes: menuActivity.votes,
      comments: menuActivity.comments,
      swaps: menuActivity.swaps,
    });
}
