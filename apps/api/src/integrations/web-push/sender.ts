import webpush from 'web-push';
import { PushRejectedError, type PushSender } from '../../services/push.js';

/** The VAPID key pair and subject from VAPID_* (`config.vapid`). */
export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
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
