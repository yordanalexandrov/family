import webpush from 'web-push';
import type { VapidConfig } from '../../config.js';

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

/** How long the push service keeps a message for a device that is offline; a reminder is stale after that. */
const TTL_SECONDS = 4 * 60 * 60;
const REQUEST_TIMEOUT_MS = 15_000;

/** The `PushSender` of production: `web-push` signs with VAPID and encrypts for the device. */
export function createWebPushSender(vapid: VapidConfig): PushSender {
  const vapidDetails = {
    subject: vapid.subject,
    publicKey: vapid.publicKey,
    privateKey: vapid.privateKey,
  };
  return async (target, payload) => {
    try {
      await webpush.sendNotification(target, payload, {
        vapidDetails,
        TTL: TTL_SECONDS,
        urgency: 'high',
        timeout: REQUEST_TIMEOUT_MS,
      });
    } catch (error) {
      if (error instanceof webpush.WebPushError) {
        throw new PushRejectedError(error.statusCode);
      }
      throw error;
    }
  };
}
