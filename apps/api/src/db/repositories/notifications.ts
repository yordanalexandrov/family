import type {
  NotificationKind,
  NotificationSettings,
  PushSubscriptionInput,
} from '@family/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '../client.js';
import {
  notificationSetting,
  pushSubscription,
} from '../schema/notifications.js';

/** A device of a person, as the sender needs it. */
export interface StoredSubscription {
  id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Saves the device for `userId`; a known endpoint moves to `userId` with the new keys. */
export async function upsertPushSubscription(
  db: DbExecutor,
  userId: string,
  { endpoint, keys }: PushSubscriptionInput,
): Promise<void> {
  await db
    .insert(pushSubscription)
    .values({ userId, endpoint, p256dh: keys.p256dh, auth: keys.auth })
    .onConflictDoUpdate({
      target: pushSubscription.endpoint,
      set: { userId, p256dh: keys.p256dh, auth: keys.auth },
    });
}

/** Removes the device only if it is `userId`'s, so nobody turns off someone else's phone. */
export async function deleteUserPushSubscription(
  db: DbExecutor,
  userId: string,
  endpoint: string,
): Promise<void> {
  await db
    .delete(pushSubscription)
    .where(
      and(
        eq(pushSubscription.userId, userId),
        eq(pushSubscription.endpoint, endpoint),
      ),
    );
}

export async function deletePushSubscription(
  db: DbExecutor,
  id: string,
): Promise<void> {
  await db.delete(pushSubscription).where(eq(pushSubscription.id, id));
}

/** The person's devices, the oldest first. */
export async function listPushSubscriptions(
  db: DbExecutor,
  userId: string,
): Promise<StoredSubscription[]> {
  const rows = await db
    .select({
      id: pushSubscription.id,
      endpoint: pushSubscription.endpoint,
      p256dh: pushSubscription.p256dh,
      auth: pushSubscription.auth,
    })
    .from(pushSubscription)
    .where(eq(pushSubscription.userId, userId))
    .orderBy(asc(pushSubscription.createdAt), asc(pushSubscription.id));
  return rows.map(({ id, endpoint, p256dh, auth }) => ({
    id,
    endpoint,
    keys: { p256dh, auth },
  }));
}

export async function markPushSubscriptionSucceeded(
  db: DbExecutor,
  id: string,
  at: Date,
): Promise<void> {
  await db
    .update(pushSubscription)
    .set({ lastSuccessAt: at })
    .where(eq(pushSubscription.id, id));
}

/** The kinds `userId` set; a kind without a row is on. */
export async function listNotificationSettings(
  db: DbExecutor,
  userId: string,
): Promise<Partial<NotificationSettings>> {
  const rows = await db
    .select({
      kind: notificationSetting.kind,
      enabled: notificationSetting.enabled,
    })
    .from(notificationSetting)
    .where(eq(notificationSetting.userId, userId));
  return Object.fromEntries(rows.map((row) => [row.kind, row.enabled]));
}

export async function upsertNotificationSettings(
  db: DbExecutor,
  userId: string,
  settings: NotificationSettings,
): Promise<void> {
  await db
    .insert(notificationSetting)
    .values(
      Object.entries(settings).map(([kind, enabled]) => ({
        userId,
        kind: kind as NotificationKind,
        enabled,
      })),
    )
    .onConflictDoUpdate({
      target: [notificationSetting.userId, notificationSetting.kind],
      set: { enabled: sql`excluded.enabled` },
    });
}
