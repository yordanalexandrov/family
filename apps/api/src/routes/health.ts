import { healthSchema } from '@family/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { checkHealth } from '../services/health.js';

/** Outside Cloudflare Access: the deploy smoke test and monitoring ask it. */
export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/healthz',
    { schema: { response: { 200: healthSchema, 503: healthSchema } } },
    async (request, reply) => {
      const health = await checkHealth(
        app.db,
        request.log,
        {
          calendar: app.calendarSync !== null,
          budget: app.budgetSync !== null,
        },
        app.now(),
      );
      return reply.code(health.status === 'ok' ? 200 : 503).send(health);
    },
  );
};
