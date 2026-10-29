import {
  mealReplace,
  menuPropose,
  recipeNormalize,
  recipeSuggest,
} from '@family/shared';
import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import type { CalendarSourceConfig, OpenClawConfig } from './config.js';
import { closeDb, createDb, type Db } from './db/client.js';
import { upsertCalendarSources } from './db/repositories/calendar-sources.js';
import type { GoogleCalendarClient } from './integrations/google-calendar/client.js';
import type { WalletClient } from './integrations/wallet/client.js';
import { createOpenClawClient } from './openclaw/client.js';
import actingUser from './plugins/acting-user.js';
import cloudflareAccess, {
  type CloudflareAccessOptions,
} from './plugins/cloudflare-access.js';
import errorHandler from './plugins/error-handler.js';
import scheduler, { type SchedulerOptions } from './plugins/scheduler.js';
import { appliancesRoutes } from './routes/appliances.js';
import { calendarEventsRoutes } from './routes/calendar-events.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { eventsRoutes } from './routes/events.js';
import { healthRoutes } from './routes/health.js';
import { ingredientsRoutes } from './routes/ingredients.js';
import { meRoutes } from './routes/me.js';
import { mealReplacementsRoutes } from './routes/meal-replacements.js';
import { menuRoutes } from './routes/menu.js';
import { notificationsRoutes } from './routes/notifications.js';
import { pantryRoutes } from './routes/pantry.js';
import { recipeImportsRoutes } from './routes/recipe-imports.js';
import { recipeSuggestionsRoutes } from './routes/recipe-suggestions.js';
import { recipesRoutes } from './routes/recipes.js';
import { shoppingRoutes } from './routes/shopping.js';
import { syncRoutes } from './routes/sync.js';
import { usersRoutes } from './routes/users.js';
import { createBudgetSync } from './services/budget-sync.js';
import { createCalendarSync } from './services/calendar-sync.js';
import { createContractRequests } from './services/contract-requests.js';
import { createEventBus, type EventBus } from './services/events.js';
import {
  createMealReplaceStore,
  type MealReplacements,
} from './services/meal-replacements.js';
import {
  createMenuProposalStore,
  createMenuService,
  type MenuService,
} from './services/menu.js';
import { createMenuNotifications } from './services/menu-notifications.js';
import {
  createMenuSchedule,
  type MenuSchedule,
} from './services/menu-schedule.js';
import {
  createPushService,
  type PushService,
  type WebPushDelivery,
} from './services/push.js';
import {
  createRecipeImportStore,
  createRecipeImportsService,
  type RecipeImportsService,
} from './services/recipe-imports.js';
import {
  createRecipeSuggestionsService,
  type RecipeSuggestionsService,
  suggestionRequestStore,
} from './services/recipe-suggestions.js';
import { createReminders, type Reminders } from './services/reminders.js';
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
    /** Suggestion requests (`recipe.suggest`) and decisions on their suggestions. */
    recipeSuggestions: RecipeSuggestionsService;
    /** Imports of recipes (`recipe.normalize`); their suggestions are decided through `recipeSuggestions`. */
    recipeImports: RecipeImportsService;
    /** The weekly menu and its proposals (`menu.propose`). */
    menu: MenuService;
    /** The cron's proposal of next week's menu; `null` without OpenClaw. */
    menuSchedule: MenuSchedule | null;
    /** „✨ Предложи друго“ for a meal (`meal.replace`). */
    mealReplacements: MealReplacements;
    /** Change signals for `GET /api/events`; services publish after their commit. */
    events: EventBus;
    /** Web Push to the people's devices; without VAPID keys every send is a no-op. */
    push: PushService;
    /** The reminders: the cron's `reminders` job (every 5 minutes) and the answer that replaces „Кой готви довечера?“. */
    reminders: Reminders;
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
  /**
   * The OpenClaw gateway for AI contracts. In dev mode, without it or without `gatewayPassword`, the client is
   * disabled and `POST /api/recipe-suggestions/requests` answers 503 `openclaw_unavailable`; any other mode throws.
   */
  openclaw?: OpenClawConfig;
  /**
   * Web Push: the VAPID public key for the devices and the sender (`server.ts` builds it with `web-push` from
   * VAPID_*; specs pass a mock). Without it no notification is sent and `GET /api/notifications/vapid-key` is 404.
   */
  push?: WebPushDelivery;
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
  openclaw,
  push,
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
  app.decorate('now', now);
  const events = createEventBus((error) =>
    app.log.warn({ err: error }, 'event listener failed'),
  );
  app.decorate('events', events);
  app.decorate(
    'push',
    createPushService({
      db,
      delivery: push ?? null,
      now,
      log: app.log.child({ module: 'push' }),
    }),
  );
  const menuNotifications = createMenuNotifications({
    db,
    push: app.push,
    now,
    log: app.log.child({ module: 'menu-notifications' }),
  });
  app.decorate(
    'reminders',
    createReminders({
      db,
      push: app.push,
      now,
      log: app.log.child({ module: 'reminders' }),
      menuNotifications,
    }),
  );
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
  // Without a gateway password (dev only) there is no client and every AI request is refused with 503.
  const contractRequests = createContractRequests({
    db,
    client: openclaw
      ? createOpenClawClient(openclaw, app.log.child({ module: 'openclaw' }))
      : null,
    log: app.log,
  });
  // Without OpenClaw nothing is sent, so the agent ids do not matter then.
  const agents = openclaw ?? {
    recipeAgent: '',
    menuAgent: '',
    mealAgent: '',
    importAgent: '',
  };
  app.decorate(
    'recipeSuggestions',
    createRecipeSuggestionsService({
      db,
      requests: contractRequests.register(
        recipeSuggest,
        suggestionRequestStore,
        agents.recipeAgent,
      ),
    }),
  );
  app.decorate(
    'recipeImports',
    createRecipeImportsService({
      db,
      requests: contractRequests.register(
        recipeNormalize,
        createRecipeImportStore(),
        agents.importAgent,
      ),
    }),
  );
  const menuProposals = contractRequests.register(
    menuPropose,
    createMenuProposalStore(events, menuNotifications),
    agents.menuAgent,
  );
  app.decorate(
    'menu',
    createMenuService({ db, proposals: menuProposals, now, events }),
  );
  // Without OpenClaw every proposal is refused, so the cron has nothing to run.
  app.decorate(
    'menuSchedule',
    openclaw
      ? createMenuSchedule({ db, proposals: menuProposals, now, log: app.log })
      : null,
  );
  app.decorate(
    'mealReplacements',
    contractRequests.register(
      mealReplace,
      createMealReplaceStore(now),
      agents.mealAgent,
    ),
  );
  app.addHook('onClose', async () => {
    await contractRequests.close();
    await closeDb(db);
  });
  // Runs once the app is ready, i.e. after `server.ts` applied the migrations.
  app.addHook('onReady', () => contractRequests.failStale());

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
  app.register(ingredientsRoutes);
  app.register(recipesRoutes);
  app.register(recipeSuggestionsRoutes);
  app.register(recipeImportsRoutes);
  app.register(menuRoutes);
  app.register(mealReplacementsRoutes);
  app.register(shoppingRoutes);
  app.register(pantryRoutes);
  app.register(appliancesRoutes);
  app.register(eventsRoutes);
  app.register(notificationsRoutes);

  return app;
}
