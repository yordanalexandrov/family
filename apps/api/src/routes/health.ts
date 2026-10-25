import type { Health } from '@family/shared';
import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  // The database check arrives with Postgres (next ticket); until then it is reported as skipped.
  app.get('/healthz', (): Health => ({ status: 'ok', db: 'skipped' }));
};
