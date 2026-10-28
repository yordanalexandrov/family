import {
  notificationSettingsBodySchema,
  pushDisabledSchema,
  pushSubscriptionInputSchema,
  pushTestResponseSchema,
  pushUnsubscribeSchema,
  vapidKeyResponseSchema,
} from '@family/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { NotFoundError } from '../services/errors.js';
import type { PushService } from '../services/push.js';

/** The VAPID public key; 404 `push_disabled` when the server has no VAPID keys and sends nothing. */
function requirePublicKey(push: PushService): string {
  if (!push.publicKey) {
    throw new NotFoundError('Известията не са включени на сървъра', {
      code: 'push_disabled',
    });
  }
  return push.publicKey;
}

/** Notifications (GLOSSARY: Известие): the acting user's devices and the kinds they want. */
export const notificationsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/api/notifications/vapid-key',
    {
      schema: {
        response: { 200: vapidKeyResponseSchema, 404: pushDisabledSchema },
      },
    },
    async () => ({ publicKey: requirePublicKey(app.push) }),
  );

  app.put(
    '/api/notifications/subscription',
    { schema: { body: pushSubscriptionInputSchema } },
    async (request, reply) => {
      await app.push.subscribe(request.actor.id, request.body);
      return reply.code(204).send();
    },
  );

  app.delete(
    '/api/notifications/subscription',
    { schema: { body: pushUnsubscribeSchema } },
    async (request, reply) => {
      await app.push.unsubscribe(request.actor.id, request.body.endpoint);
      return reply.code(204).send();
    },
  );

  app.get(
    '/api/notifications/settings',
    { schema: { response: { 200: notificationSettingsBodySchema } } },
    async (request) => ({
      settings: await app.push.settings(request.actor.id),
    }),
  );

  app.put(
    '/api/notifications/settings',
    {
      schema: {
        body: notificationSettingsBodySchema,
        response: { 200: notificationSettingsBodySchema },
      },
    },
    async (request) => {
      await app.push.saveSettings(request.actor.id, request.body.settings);
      return { settings: await app.push.settings(request.actor.id) };
    },
  );

  app.post(
    '/api/notifications/test',
    {
      schema: {
        response: { 200: pushTestResponseSchema, 404: pushDisabledSchema },
      },
    },
    async (request) => {
      requirePublicKey(app.push);
      return { sent: await app.push.sendTest(request.actor.id) };
    },
  );
};
