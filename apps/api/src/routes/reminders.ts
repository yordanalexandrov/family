import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { idParamsSchema } from './params.js';

/** The buttons of the reminders (GLOSSARY: Напомняне); the service worker calls them with the person's `x-acting-user`. */
export const remindersRoutes: FastifyPluginAsyncZod = async (app) => {
  // „Извадих“ on „Извади месото“.
  app.post(
    '/api/menu/meals/:id/thawed',
    { schema: { params: idParamsSchema } },
    async (request, reply) => {
      await app.reminders.thawed(request.params.id);
      return reply.code(204).send();
    },
  );

  // „Аз“ on „Кой готви довечера“: first wins; 409 `cook_taken` (`cookTakenSchema`) after.
  app.post(
    '/api/menu/meals/:id/cook-claim',
    { schema: { params: idParamsSchema } },
    async (request, reply) => {
      await app.reminders.claimCook(request.params.id, request.actor.id);
      return reply.code(204).send();
    },
  );
};
