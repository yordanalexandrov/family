import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { runMigrations } from './db/migrate.js';
import { loggerOptions } from './logger.js';

const config = loadConfig();
const app = buildApp({
  logger: loggerOptions(config),
  databaseUrl: config.DATABASE_URL,
});

try {
  // Migrations run before the first request is accepted; failing to apply them is fatal.
  await runMigrations(app.db, { log: app.log });
  await app.listen({ host: config.API_HOST, port: config.API_PORT });
} catch (error) {
  app.log.fatal({ err: error }, 'api failed to start');
  await app.close().catch(() => undefined);
  process.exit(1);
}
