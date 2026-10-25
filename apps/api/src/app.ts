import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import type { CalendarSourceConfig } from './config.js';
import { closeDb, createDb, type Db } from './db/client.js';
import { upsertCalendarSources } from './db/repositories/calendar-sources.js';
import type { GoogleCalendarClient } from './integrations/google-calendar/client.js';
import type { WalletClient } from './integrations/wallet/client.js';
import actingUser from './plugins/acting-user.js';
import cloudflareAccess, {
  type CloudflareAccessOptions,
} from './plugins/cloudflare-access.js';
import errorHandler from './plugins/error-handler.js';
import scheduler, { type SchedulerOptions } from './plugins/scheduler.js';
import { calendarEventsRoutes } from './routes/calendar-events.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { healthRoutes } from './routes/health.js';
import { meRoutes } from './routes/me.js';
import { syncRoutes } from './routes/sync.js';
import { usersRoutes } from './routes/users.js';
import { createBudgetSync } from './services/budget-sync.js';
import { createCalendarSync } from './services/calendar-sync.js';
import type { Sync } from './services/sync-mutex.js';
import { createUsersService, type UsersService } from './services/users.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    /** Shared by the acting-user hook and `GET /api/users`, so both read the same one-minute cache. */
    users: UsersService;
    /** `null` when Google Calendar is not configured: nothing syncs and the calendar shows as unconfigured. */
    calendarSync: Sync | null;
    /** `null` when Wallet is not configured: nothing syncs and the budget shows as unconfigured. */
    budgetSync: Sync | null;
    /** The clock of the app; specs fix it. */
    now: () => Date;
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
   * GOOGLE_CALENDARS: made the enabled calendar sources once the app is ready (after `server.ts` has run the
   * migrations), so a calendar no longer listed stops showing. Left out, the table is not touched.
   */
  calendarSources?: CalendarSourceConfig[];
  /** Google Calendar access (`server.ts` builds it from GOOGLE_SERVICE_ACCOUNT_JSON); without it the sync is off. */
  googleCalendar?: GoogleCalendarClient;
  /** Wallet access and the family budget (`server.ts` builds it from WALLET_*); without it the sync is off. */
  wallet?: { client: WalletClient; budgetId: string };
  /** The clock for "today" and for sync runs; specs fix it. */
  now?: () => Date;
  /** Runs the periodic syncs (`server.ts`); specs leave it out and sync by hand. */
  scheduler?: SchedulerOptions;
}

/**
 * Builds the Fastify instance without listening, so tests can drive it with `app.inject()`.
 * The app owns the database pool: it is available as `app.db` right away and closed with `app.close()`.
 */
export function buildApp({
  logger = false,
  databaseUrl,
  auth,
  calendarSources,
  googleCalendar,
  wallet,
  now = () => new Date(),
  scheduler: schedulerOptions,
}: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger });

  // Route schemas are Zod (from @family/shared): they validate the input and check the output.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const db = createDb(databaseUrl, (error) =>
    app.log.error({ err: error }, 'postgres pool error'),
  );
  app.decorate('db', db);
  app.decorate('users', createUsersService(db));
  app.decorate('now', now);
  app.decorate(
    'calendarSync',
    googleCalendar
      ? createCalendarSync({ db, listEvents: googleCalendar.listEvents, now })
      : null,
  );
  app.decorate(
    'budgetSync',
    wallet
      ? createBudgetSync({
          db,
          wallet: wallet.client,
          budgetId: wallet.budgetId,
          now,
        })
      : null,
  );
  if (calendarSources) {
    app.addHook('onReady', () => upsertCalendarSources(db, calendarSources));
  }
  app.addHook('onClose', () => closeDb(db));

  app.register(errorHandler);
  app.register(cloudflareAccess, auth);
  app.register(actingUser);
  if (schedulerOptions) {
    app.register(scheduler, schedulerOptions);
  }

  app.register(healthRoutes);
  app.register(usersRoutes);
  app.register(meRoutes);
  app.register(syncRoutes);
  app.register(calendarEventsRoutes);
  app.register(dashboardRoutes);

  return app;
}
