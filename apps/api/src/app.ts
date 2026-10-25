import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { closeDb, createDb, type Db } from './db/client.js';
import errorHandler from './plugins/error-handler.js';
import { healthRoutes } from './routes/health.js';
import { usersRoutes } from './routes/users.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
  }
}

export interface BuildAppOptions {
  logger?: FastifyServerOptions['logger'];
  databaseUrl: string;
}

/**
 * Builds the Fastify instance without listening, so tests can drive it with `app.inject()`.
 * The app owns the database pool: it is available as `app.db` right away and closed with `app.close()`.
 */
export function buildApp({
  logger = false,
  databaseUrl,
}: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger });

  // Route schemas are Zod (from @family/shared): they validate the input and check the output.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const db = createDb(databaseUrl, (error) =>
    app.log.error({ err: error }, 'postgres pool error'),
  );
  app.decorate('db', db);
  app.addHook('onClose', () => closeDb(db));

  app.register(errorHandler);
  app.register(healthRoutes);
  app.register(usersRoutes);

  return app;
}
