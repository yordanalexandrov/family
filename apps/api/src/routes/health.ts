import type { Health } from '@family/shared';
import type { FastifyPluginAsync } from 'fastify';
import { pingDb } from '../db/client.js';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/healthz', async (request, reply): Promise<Health> => {
    try {
      await pingDb(app.db);
    } catch (error) {
      request.log.error({ err: error }, 'database ping failed');
      reply.code(503);
      return { status: 'degraded', db: 'down' };
    }
    return { status: 'ok', db: 'ok' };
  });
};
