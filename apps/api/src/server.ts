import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { runMigrations } from './db/migrate.js';
import { upsertCalendarSources } from './db/repositories/calendar-sources.js';
import { createCalendarClient } from './integrations/google-calendar/client.js';
import { loggerOptions } from './logger.js';

const config = loadConfig();
const app = buildApp({
  logger: loggerOptions(config),
  databaseUrl: config.DATABASE_URL,
  auth: config.auth,
  googleCalendar:
    config.calendarConfigured && config.GOOGLE_SERVICE_ACCOUNT_JSON
      ? createCalendarClient(config.GOOGLE_SERVICE_ACCOUNT_JSON)
      : undefined,
  scheduler: {},
});

try {
  // Migrations run before the first request is accepted; failing to apply them is fatal.
  await runMigrations(app.db, { log: app.log });
  if (config.GOOGLE_CALENDARS) {
    await upsertCalendarSources(app.db, config.GOOGLE_CALENDARS);
  }
  await app.listen({ host: config.API_HOST, port: config.API_PORT });
} catch (error) {
  app.log.fatal({ err: error }, 'api failed to start');
  await app.close().catch(() => undefined);
  process.exit(1);
}

// In the container node is PID 1 and gets no default signal handling: without this,
// `docker compose stop` waits 10 s and kills it. Closing lets in-flight requests finish and ends the pool.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'api shutting down');
    app.close().then(
      () => process.exit(0),
      (error: unknown) => {
        app.log.error({ err: error }, 'api did not shut down cleanly');
        process.exit(1);
      },
    );
  });
}
