import { type SyncSource, syncRunResultSchema } from '@family/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Sync } from '../services/sync-mutex.js';

/** „Обнови сега“: a sync started by hand, by an acting user. */
export const syncRoutes: FastifyPluginAsyncZod = async (app) => {
  const routes: Record<SyncSource, Sync | null> = {
    calendar: app.calendarSync,
    budget: app.budgetSync,
  };
  for (const [source, sync] of Object.entries(routes) as [
    SyncSource,
    Sync | null,
  ][]) {
    app.post(
      `/api/sync/${source}`,
      {
        schema: {
          response: { 200: syncRunResultSchema, 202: syncRunResultSchema },
        },
      },
      async (_request, reply) => {
        if (!sync) {
          return { source, status: 'unconfigured' as const };
        }
        const result = await sync.run();
        return reply.code(result.status === 'running' ? 202 : 200).send(result);
      },
    );
  }
};
