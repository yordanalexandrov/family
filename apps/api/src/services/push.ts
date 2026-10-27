import {
  type NotificationKind,
  type NotificationSettings,
  notificationKindSchema,
  type PushKind,
  type PushPayload,
  type PushSubscriptionInput,
} from '@family/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../db/client.js';
import {
  deletePushSubscription,
  deleteUserPushSubscription,
  listNotificationSettings,
  listPushSubscriptions,
  markPushSubscriptionSucceeded,
  upsertNotificationSettings,
  upsertPushSubscription,
} from '../db/repositories/notifications.js';

/** A device to push to: the subscription's endpoint and its keys. */
export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Hands one encrypted message to the device's push service (`web-push` in production, a mock in specs). Rejects with
 * a `PushRejectedError` when the push service answers an error status, with anything else when it cannot be reached.
 */
export type PushSender = (target: PushTarget, payload: string) => Promise<void>;

/** The push service refused the message with `statusCode`; 404 and 410 mean the subscription is gone. */
export class PushRejectedError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number) {
    super(`push service answered ${statusCode}`);
    this.name = 'PushRejectedError';
    this.statusCode = statusCode;
  }
}

/** What a notification says; `send` adds its kind and the person it is for. */
export type PushMessage = Omit<PushPayload, 'kind' | 'userId'>;

/** „Пробно известие“ from „Настройки“. */
const TEST_MESSAGE: PushMessage = {
  title: 'Пробно известие',
  body: 'Известията на това устройство работят.',
  tag: 'test',
  url: '/settings',
};

/** Web Push of the app (`app.push`), created once in `buildApp()`. */
export interface PushService {
  /** The VAPID public key for `pushManager.subscribe()`; `null` without VAPID keys. */
  readonly publicKey: string | null;
  /** Saves a device of `userId`; a device someone else subscribed moves to `userId`. */
  subscribe(userId: string, subscription: PushSubscriptionInput): Promise<void>;
  /** Forgets a device of `userId`; someone else's device or an unknown one is left alone. */
  unsubscribe(userId: string, endpoint: string): Promise<void>;
  /** Every kind, on unless `userId` turned it off. */
  settings(userId: string): Promise<NotificationSettings>;
  saveSettings(userId: string, settings: NotificationSettings): Promise<void>;
  /**
   * Sends `message` to every device of `userId`, if the person has `kind` on; answers how many devices the push
   * services took it for. A device that is gone is deleted and any other push failure is logged, so it rejects only
   * when the database does.
   */
  send(
    userId: string,
    kind: NotificationKind,
    message: PushMessage,
  ): Promise<number>;
  /** „Пробно известие“ to every device of `userId`, whatever the settings. */
  sendTest(userId: string): Promise<number>;
}

export interface PushServiceDeps {
  db: Db;
  /** Without VAPID keys there is none: every send is a no-op. */
  web: { publicKey: string; sender: PushSender } | null;
  now: () => Date;
  log: FastifyBaseLogger;
}

/** The push service says the subscription no longer exists. */
function isGone(error: unknown): boolean {
  return (
    error instanceof PushRejectedError &&
    (error.statusCode === 404 || error.statusCode === 410)
  );
}

export function createPushService({
  db,
  web,
  now,
  log,
}: PushServiceDeps): PushService {
  async function deliver(
    userId: string,
    kind: PushKind,
    message: PushMessage,
  ): Promise<number> {
    if (!web) {
      log.debug({ kind, userId }, 'push: no VAPID keys, nothing sent');
      return 0;
    }
    const payload: PushPayload = { ...message, kind, userId };
    const body = JSON.stringify(payload);
    const devices = await listPushSubscriptions(db, userId);
    const results = await Promise.all(
      devices.map(async (device) => {
        try {
          await web.sender(device, body);
          await markPushSubscriptionSucceeded(db, device.id, now());
          return true;
        } catch (error) {
          if (isGone(error)) {
            log.info({ kind, userId }, 'push: subscription gone, deleted');
            await deletePushSubscription(db, device.id);
          } else {
            log.warn({ err: error, kind, userId }, 'push: not sent');
          }
          return false;
        }
      }),
    );
    return results.filter(Boolean).length;
  }

  async function settings(userId: string): Promise<NotificationSettings> {
    const saved = await listNotificationSettings(db, userId);
    return Object.fromEntries(
      notificationKindSchema.options.map((kind) => [kind, saved[kind] ?? true]),
    ) as NotificationSettings;
  }

  return {
    publicKey: web?.publicKey ?? null,
    subscribe: (userId, subscription) =>
      upsertPushSubscription(db, userId, subscription),
    unsubscribe: (userId, endpoint) =>
      deleteUserPushSubscription(db, userId, endpoint),
    settings,
    saveSettings: (userId, value) =>
      upsertNotificationSettings(db, userId, value),
    async send(userId, kind, message) {
      if (!(await settings(userId))[kind]) {
        log.debug({ kind, userId }, 'push: kind turned off, nothing sent');
        return 0;
      }
      return deliver(userId, kind, message);
    },
    sendTest: (userId) => deliver(userId, 'test', TEST_MESSAGE),
  };
}
