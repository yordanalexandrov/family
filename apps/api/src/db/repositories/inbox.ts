import type {
  InboxDetail,
  InboxItem,
  NotificationKind,
  PushAction,
} from '@family/shared';
import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  sql,
} from 'drizzle-orm';
import type { DbExecutor } from '../client.js';
import { meal } from '../schema/menu.js';
import { inboxItem } from '../schema/notifications.js';

/** What a notification writes into the inbox of one person. */
export interface InboxWrite {
  userId: string;
  kind: NotificationKind;
  tag: string;
  title: string;
  body: string;
  url: string;
  details: InboxDetail[];
  /** The buttons of a question; `null` for a notification without, which keeps the buttons of the row it updates. */
  actions: PushAction[] | null;
  actionUntil: Date | null;
}

/** A notification as the inbox keeps it; {@link InboxItem} without the buttons, which the service decides on. */
export interface StoredInboxItem
  extends Omit<InboxItem, 'actions' | 'answered'> {
  tag: string;
  actions: PushAction[] | null;
  actionUntil: Date | null;
}

/**
 * Writes the notification at `at`: a new row, or the person's row with the same `tag` updated (content,
 * `updated_at`, unread again; `created_at` stays, and so do the buttons when the new one has none). Answers the row's
 * id.
 */
export async function upsertInboxItem(
  db: DbExecutor,
  item: InboxWrite,
  at: Date,
): Promise<string> {
  const { userId, tag, ...content } = item;
  const [row] = await db
    .insert(inboxItem)
    .values({ ...item, createdAt: at, updatedAt: at })
    .onConflictDoUpdate({
      target: [inboxItem.userId, inboxItem.tag],
      set: {
        ...content,
        actions: sql`coalesce(excluded.actions, ${inboxItem.actions})`,
        actionUntil: sql`coalesce(excluded.action_until, ${inboxItem.actionUntil})`,
        updatedAt: at,
        readAt: null,
      },
    })
    .returning({ id: inboxItem.id });
  if (!row) {
    throw new Error('inbox item not written');
  }
  return row.id;
}

/** The person's notifications, the last updated first. */
export async function listInboxItems(
  db: DbExecutor,
  userId: string,
): Promise<StoredInboxItem[]> {
  const rows = await db
    .select()
    .from(inboxItem)
    .where(eq(inboxItem.userId, userId))
    .orderBy(desc(inboxItem.updatedAt), desc(inboxItem.createdAt));
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    url: row.url,
    details: row.details,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    unread: row.readAt === null,
    tag: row.tag,
    actions: row.actions,
    actionUntil: row.actionUntil,
  }));
}

/** The people with a notification of one of `tags` that has buttons. */
export async function listUsersWithButtons(
  db: DbExecutor,
  tags: string[],
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: inboxItem.userId })
    .from(inboxItem)
    .where(and(inArray(inboxItem.tag, tags), isNotNull(inboxItem.actions)));
  return rows.map((row) => row.userId);
}

/** How the buttons of a reminder about a meal were answered: who cooks, who took the meat out. */
export interface MealAnswers {
  id: string;
  cookUserId: string | null;
  thawedAt: Date | null;
  thawedByUserId: string | null;
}

/** The answers of the meals `ids`; a meal that is gone is left out. */
export async function listMealAnswers(
  db: DbExecutor,
  ids: string[],
): Promise<MealAnswers[]> {
  if (ids.length === 0) {
    return [];
  }
  return db
    .select({
      id: meal.id,
      cookUserId: meal.cookUserId,
      thawedAt: meal.thawedAt,
      thawedByUserId: meal.thawedByUserId,
    })
    .from(meal)
    .where(inArray(meal.id, ids));
}

export async function countUnreadInboxItems(
  db: DbExecutor,
  userId: string,
): Promise<number> {
  const [row] = await db
    .select({ unread: count() })
    .from(inboxItem)
    .where(and(eq(inboxItem.userId, userId), isNull(inboxItem.readAt)));
  return row?.unread ?? 0;
}

/**
 * Marks the person's notification `id` read at `at` (a read one keeps when it was read); answers `false` when the
 * person has no such notification.
 */
export async function markInboxItemRead(
  db: DbExecutor,
  userId: string,
  id: string,
  at: Date,
): Promise<boolean> {
  const where = and(eq(inboxItem.id, id), eq(inboxItem.userId, userId));
  await db
    .update(inboxItem)
    .set({ readAt: at })
    .where(and(where, isNull(inboxItem.readAt)));
  const [row] = await db
    .select({ id: inboxItem.id })
    .from(inboxItem)
    .where(where);
  return row !== undefined;
}

/** Marks every unread notification of the person read at `at`. */
export async function markAllInboxItemsRead(
  db: DbExecutor,
  userId: string,
  at: Date,
): Promise<void> {
  await db
    .update(inboxItem)
    .set({ readAt: at })
    .where(and(eq(inboxItem.userId, userId), isNull(inboxItem.readAt)));
}

/** Deletes every notification last updated before `before`, read or not; answers how many. */
export async function deleteInboxItemsBefore(
  db: DbExecutor,
  before: Date,
): Promise<number> {
  const rows = await db
    .delete(inboxItem)
    .where(lt(inboxItem.updatedAt, before))
    .returning({ id: inboxItem.id });
  return rows.length;
}
