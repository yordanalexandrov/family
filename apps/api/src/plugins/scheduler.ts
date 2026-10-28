import type { SyncRunResult } from '@family/shared';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { pruneRuns } from '../db/repositories/sync-runs.js';

const MINUTE_MS = 60_000;
const CALENDAR_INTERVAL_MS = 5 * MINUTE_MS;
const BUDGET_INTERVAL_MS = 60 * MINUTE_MS;
const PRUNE_INTERVAL_MS = 24 * 60 * MINUTE_MS;
/** How often the cron looks whether next week's menu is due (`services/menu-schedule.ts`); also once at start. */
const MENU_PROPOSE_INTERVAL_MS = 15 * MINUTE_MS;
/** How often the cron sends what is due (`services/reminders.ts`); also once at start. */
const REMINDERS_INTERVAL_MS = 5 * MINUTE_MS;
/** Days of `sync_run` history kept (the last success of each source is always kept). */
const KEEP_RUNS_DAYS = 7;

export interface SchedulerOptions {
  /** Delay of every job's first run after `ready`; 5 s by default, so start-up is not slowed down. */
  firstRunDelayMs?: number;
}

export interface Job {
  name: string;
  intervalMs: number;
  /** Each wait is `intervalMs ± jitter × intervalMs`, so syncs do not fall in step with anything else. */
  jitter?: number;
  /** A sync answers its result (logged, a `failed` one as a warning); housekeeping answers nothing. */
  run: () => Promise<SyncRunResult | undefined>;
}

function jittered(intervalMs: number, jitter: number): number {
  return intervalMs * (1 + jitter * (2 * Math.random() - 1));
}

/**
 * The api's own cron: a `setTimeout` chain per job, the first run shortly after `ready`, the next one when the
 * previous has finished. Stopped on close, which waits for a job under way so it does not lose the database.
 */
const scheduler: FastifyPluginAsync<SchedulerOptions> = async (
  app,
  { firstRunDelayMs = 5_000 },
) => {
  const timers = new Set<NodeJS.Timeout>();
  const running = new Set<Promise<void>>();
  let closing = false;

  async function execute({ name, run }: Job) {
    const startedAt = Date.now();
    app.log.info({ job: name }, 'job started');
    try {
      const result = await run();
      const failed = result?.status === 'failed';
      app.log[failed ? 'warn' : 'info'](
        { job: name, durationMs: Date.now() - startedAt, result },
        'job finished',
      );
    } catch (error) {
      app.log.error(
        { job: name, durationMs: Date.now() - startedAt, err: error },
        'job failed',
      );
    }
  }

  function schedule(job: Job) {
    const { intervalMs, jitter = 0.25 } = job;
    const next = (delayMs: number) => {
      if (closing) {
        return;
      }
      const timer = setTimeout(() => {
        timers.delete(timer);
        const execution = execute(job).finally(() => {
          running.delete(execution);
          next(jittered(intervalMs, jitter));
        });
        running.add(execution);
      }, delayMs);
      timers.add(timer);
    };
    app.addHook('onReady', async () => next(firstRunDelayMs));
  }

  const { calendarSync } = app;
  if (calendarSync) {
    schedule({
      name: 'calendar',
      intervalMs: CALENDAR_INTERVAL_MS,
      run: () => calendarSync.run(),
    });
  } else {
    app.log.info('calendar sync: unconfigured');
  }

  const { budgetSync } = app;
  if (budgetSync) {
    schedule({
      name: 'budget',
      intervalMs: BUDGET_INTERVAL_MS,
      run: () => budgetSync.run(),
    });
  } else {
    app.log.info('budget sync: unconfigured');
  }

  const { menuSchedule } = app;
  if (menuSchedule) {
    schedule({
      name: 'menu-propose',
      intervalMs: MENU_PROPOSE_INTERVAL_MS,
      run: async () => {
        const proposal = await menuSchedule.run();
        if (proposal) {
          app.log.info(
            {
              job: 'menu-propose',
              proposalId: proposal.id,
              weekStart: proposal.weekStart,
            },
            'menu proposal started',
          );
        }
        return undefined;
      },
    });
  } else {
    app.log.info('menu propose: unconfigured');
  }

  schedule({
    name: 'reminders',
    intervalMs: REMINDERS_INTERVAL_MS,
    // Notifications are due at fixed times, so the wait does not drift.
    jitter: 0,
    run: async () => {
      await app.reminders.run();
      return undefined;
    },
  });

  schedule({
    name: 'prune-runs',
    intervalMs: PRUNE_INTERVAL_MS,
    jitter: 0,
    run: async () => {
      await pruneRuns(app.db, KEEP_RUNS_DAYS, app.now());
      return undefined;
    },
  });

  // Before `onClose`, where the database pool is closed.
  app.addHook('preClose', async () => {
    closing = true;
    for (const timer of timers) {
      clearTimeout(timer);
    }
    timers.clear();
    await Promise.allSettled(running);
  });
};

export default fp(scheduler, { name: 'scheduler' });
