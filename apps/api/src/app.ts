import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import type { OpenClawConfig } from './config.js';
import { closeDb, createDb, type Db } from './db/client.js';
import { createOpenClawClient } from './openclaw/client.js';
import actingUser from './plugins/acting-user.js';
import cloudflareAccess, {
  type CloudflareAccessOptions,
} from './plugins/cloudflare-access.js';
import errorHandler from './plugins/error-handler.js';
import { healthRoutes } from './routes/health.js';
import { ingredientsRoutes } from './routes/ingredients.js';
import { meRoutes } from './routes/me.js';
import { recipeSuggestionsRoutes } from './routes/recipe-suggestions.js';
import { recipesRoutes } from './routes/recipes.js';
import { usersRoutes } from './routes/users.js';
import {
  createRecipeSuggestionsService,
  type RecipeSuggestionsService,
} from './services/recipe-suggestions.js';
import { createUsersService, type UsersService } from './services/users.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    /** Shared by the acting-user hook and `GET /api/users`, so both read the same one-minute cache. */
    users: UsersService;
    /** Keeps the `recipe.suggest` runs in flight; `app.close()` aborts and awaits them before the pool closes. */
    recipeSuggestions: RecipeSuggestionsService;
  }
}

export interface BuildAppOptions {
  logger?: FastifyServerOptions['logger'];
  databaseUrl: string;
  /**
   * How `/api/*` requests are authenticated, never defaulted: `server.ts` passes `config.auth`
   * (`loadConfig()` refuses dev mode in production), specs go through `buildTestApp()` in `src/test/app.ts`.
   */
  auth: CloudflareAccessOptions;
  /**
   * The OpenClaw gateway for AI contracts. In dev mode, without it or without `gatewayPassword`, the client is
   * disabled and `POST /api/recipe-suggestions/requests` answers 503 `openclaw_unavailable`; any other mode throws.
   */
  openclaw?: OpenClawConfig;
}

/**
 * Builds the Fastify instance without listening, so tests can drive it with `app.inject()`.
 * The app owns the database pool: it is available as `app.db` right away and closed with `app.close()`.
 */
export function buildApp({
  logger = false,
  databaseUrl,
  auth,
  openclaw,
}: BuildAppOptions): FastifyInstance {
  if (auth.mode !== 'dev' && !openclaw?.gatewayPassword) {
    // `loadConfig()` refuses this too; checked here so no caller can start a disabled OpenClaw outside dev mode.
    throw new Error(
      'OpenClaw needs a gateway password unless AUTH_MODE is dev',
    );
  }
  const app = Fastify({ logger });

  // Route schemas are Zod (from @family/shared): they validate the input and check the output.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const db = createDb(databaseUrl, (error) =>
    app.log.error({ err: error }, 'postgres pool error'),
  );
  app.decorate('db', db);
  app.decorate('users', createUsersService(db));
  const client =
    openclaw &&
    createOpenClawClient(openclaw, app.log.child({ module: 'openclaw' }));
  const recipeSuggestions = createRecipeSuggestionsService({
    db,
    openclaw:
      openclaw && client ? { client, agent: openclaw.recipeAgent } : null,
    log: app.log,
  });
  app.decorate('recipeSuggestions', recipeSuggestions);
  app.addHook('onClose', async () => {
    await recipeSuggestions.close();
    await closeDb(db);
  });
  // Runs once the app is ready, i.e. after `server.ts` applied the migrations. Not fatal: the api serves without it.
  app.addHook('onReady', async () => {
    try {
      const failed = await recipeSuggestions.failStaleRequests();
      if (failed > 0) {
        app.log.warn({ failed }, 'stale suggestion requests marked failed');
      }
    } catch (error) {
      app.log.error({ err: error }, 'could not fail stale suggestion requests');
    }
  });

  app.register(errorHandler);
  app.register(cloudflareAccess, auth);
  app.register(actingUser);

  app.register(healthRoutes);
  app.register(usersRoutes);
  app.register(meRoutes);
  app.register(ingredientsRoutes);
  app.register(recipesRoutes);
  app.register(recipeSuggestionsRoutes);

  return app;
}
