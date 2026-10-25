import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';
import { healthRoutes } from './routes/health.js';

export interface BuildAppOptions {
  logger?: FastifyServerOptions['logger'];
}

/** Builds the Fastify instance without listening, so tests can drive it with `app.inject()`. */
export function buildApp({
  logger = false,
}: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger });

  app.register(healthRoutes);

  return app;
}
