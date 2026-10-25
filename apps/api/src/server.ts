import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { loggerOptions } from './logger.js';

const config = loadConfig();
const app = buildApp({
  logger: loggerOptions(config),
  databaseUrl: config.DATABASE_URL,
});

try {
  await app.listen({ host: config.API_HOST, port: config.API_PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
