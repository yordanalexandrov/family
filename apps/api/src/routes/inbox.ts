import { inboxResponseSchema, inboxUnreadCountSchema } from '@family/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { idParamsSchema } from './params.js';

/** The inbox (GLOSSARY: Входяща кутия) of the acting user: their notifications of the last 30 days. */
export const inboxRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/api/inbox',
    { schema: { response: { 200: inboxResponseSchema } } },
    async (request) => ({ items: await app.inbox.list(request.actor.id) }),
  );

  app.get(
    '/api/inbox/unread-count',
    { schema: { response: { 200: inboxUnreadCountSchema } } },
    async (request) => ({
      unread: await app.inbox.unreadCount(request.actor.id),
    }),
  );

  app.post('/api/inbox/read-all', async (request, reply) => {
    await app.inbox.readAll(request.actor.id);
    return reply.code(204).send();
  });

  app.post(
    '/api/inbox/:id/read',
    { schema: { params: idParamsSchema } },
    async (request, reply) => {
      await app.inbox.read(request.actor.id, request.params.id);
      return reply.code(204).send();
    },
  );
};
