import type { NotificationKind } from '@family/shared';
import { and, eq, inArray } from 'drizzle-orm';
import type { DbExecutor } from '../client.js';
import { notificationLog } from '../schema/notifications.js';

/** A reminder sent once: what, about which subject (a meal, or a week), on which day and to whom. */
export interface NotificationLogEntry {
  kind: NotificationKind;
  subjectId: string;
  onDate: string;
  userId: string;
}

/** The reminders of any of `kinds` sent on any of `onDates`. */
export async function listNotificationLog(
  db: DbExecutor,
  kinds: NotificationKind[],
  onDates: string[],
): Promise<NotificationLogEntry[]> {
  return db
    .select({
      kind: notificationLog.kind,
      subjectId: notificationLog.subjectId,
      onDate: notificationLog.onDate,
      userId: notificationLog.userId,
    })
    .from(notificationLog)
    .where(
      and(
        inArray(notificationLog.kind, kinds),
        inArray(notificationLog.onDate, onDates),
      ),
    );
}

/** Everyone who got a reminder of `kind` about `subjectId`, on whichever day: the meal may have moved since. */
export async function listNotifiedUsers(
  db: DbExecutor,
  kind: NotificationKind,
  subjectId: string,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: notificationLog.userId })
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.kind, kind),
        eq(notificationLog.subjectId, subjectId),
      ),
    );
  return rows.map((row) => row.userId);
}

/**
 * Records the reminder as sent at `at`; answers `false` when it was already, so of two runs at once only one sends it.
 */
export async function claimNotification(
  db: DbExecutor,
  entry: NotificationLogEntry,
  at: Date,
): Promise<boolean> {
  const rows = await db
    .insert(notificationLog)
    .values({ ...entry, sentAt: at })
    .onConflictDoNothing()
    .returning({ kind: notificationLog.kind });
  return rows.length > 0;
}
