import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { runMigrations } from './db/migrate.js';
import { createCalendarClient } from './integrations/google-calendar/client.js';
import { createWalletClient } from './integrations/wallet/client.js';
import { createWebPushSender } from './integrations/web-push/sender.js';
import { loggerOptions } from './logger.js';

const config = loadConfig();
const app = buildApp({
  logger: loggerOptions(config),
  databaseUrl: config.DATABASE_URL,
  auth: config.auth,
  calendarSources: config.GOOGLE_CALENDARS,
  googleCalendar: config.googleCalendar
    ? createCalendarClient(config.googleCalendar.serviceAccountJson)
    : undefined,
  wallet: config.wallet
    ? {
        client: createWalletClient(config.wallet.apiToken),
        budgetId: config.wallet.budgetId,
      }
    : undefined,
  scheduler: {},
  openclaw: config.openclaw,
  push: config.vapid
    ? {
        publicKey: config.vapid.publicKey,
        sender: createWebPushSender(config.vapid),
      }
    : undefined,
});

try {
  // Migrations run before the first request is accepted; failing to apply them is fatal.
  // Calendar sources are upserted in `onReady`, i.e. inside `listen`, after them.
  await runMigrations(app.db, { log: app.log });
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
