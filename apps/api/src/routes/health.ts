import type { FastifyPluginAsync } from 'fastify';
import { checkHealth } from '../services/health.js';

/** Outside Cloudflare Access: the deploy smoke test and monitoring ask it. */
export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/healthz', async (request, reply) => {
    const health = await checkHealth(app.db, request.log);
    return reply.code(health.status === 'ok' ? 200 : 503).send(health);
  });
};
