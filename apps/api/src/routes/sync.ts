import { syncRunResultSchema } from '@family/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

/** „Обнови сега“: a sync started by hand, by an acting user. */
export const syncRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/api/sync/calendar',
    {
      schema: {
        response: { 200: syncRunResultSchema, 202: syncRunResultSchema },
      },
    },
    async (_request, reply) => {
      if (!app.calendarSync) {
        return { source: 'calendar' as const, status: 'unconfigured' as const };
      }
      const result = await app.calendarSync.run();
      return reply.code(result.status === 'running' ? 202 : 200).send(result);
    },
  );
};
