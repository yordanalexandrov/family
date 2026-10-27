import { type PushPayload, pushPayloadSchema } from '@family/shared';
import {
  PushRejectedError,
  type PushSender,
  type PushTarget,
} from '../services/push.js';

/** The public key specs hand the app; the push service is the mock below, so no real pair is needed. */
export const TEST_VAPID_PUBLIC_KEY = 'BTestVapidPublicKey';

export interface TestPushService {
  /** Hand to `buildTestApp({ push: { publicKey, sender } })`. */
  sender: PushSender;
  /** Every message the push service took, in order. */
  delivered: { endpoint: string; payload: PushPayload }[];
  /** From now on the push service answers `statusCode` for `endpoint` (e.g. 410 for a device that unsubscribed). */
  reject(endpoint: string, statusCode: number): void;
}

/** The push service at the edge (`web-push` in production): takes a message, or rejects it with a status. */
export function createTestPushService(): TestPushService {
  const delivered: TestPushService['delivered'] = [];
  const rejections = new Map<string, number>();
  return {
    delivered,
    reject(endpoint, statusCode) {
      rejections.set(endpoint, statusCode);
    },
    async sender(target: PushTarget, payload: string) {
      const statusCode = rejections.get(target.endpoint);
      if (statusCode !== undefined) {
        throw new PushRejectedError(statusCode);
      }
      delivered.push({
        endpoint: target.endpoint,
        payload: pushPayloadSchema.parse(JSON.parse(payload)),
      });
    },
  };
}

/** A subscription as a phone's `PushSubscription.toJSON()` gives it; `name` makes the endpoint unique. */
export function deviceSubscription(name: string) {
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/${name}`,
    expirationTime: null,
    keys: { p256dh: `p256dh-${name}`, auth: `auth-${name}` },
  };
}
