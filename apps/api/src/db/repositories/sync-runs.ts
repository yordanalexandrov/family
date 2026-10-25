import type { SyncSource } from '@family/shared';
import { and, desc, eq, lt, notInArray } from 'drizzle-orm';
import type { Db } from '../client.js';
import { syncRun } from '../schema/dashboard.js';

export type SyncRun = typeof syncRun.$inferSelect;

/** The newest successful run and the newest run of any status (possibly still `running`). */
export interface LastRuns {
  lastSuccess: SyncRun | null;
  lastAttempt: SyncRun | null;
}

/** Records the start of a sync of `source`; returns the run's id for `finishRun`. */
export async function startRun(
  db: Db,
  source: SyncSource,
  startedAt: Date = new Date(),
): Promise<string> {
  const [run] = await db
    .insert(syncRun)
    .values({ source, startedAt, status: 'running' })
    .returning({ id: syncRun.id });
  if (!run) {
    throw new Error('sync_run insert returned no row');
  }
  return run.id;
}

export async function finishRun(
  db: Db,
  id: string,
  status: 'ok' | 'failed',
  error?: string,
  finishedAt: Date = new Date(),
): Promise<void> {
  await db
    .update(syncRun)
    .set({ status, error: error ?? null, finishedAt })
    .where(eq(syncRun.id, id));
}

/** The newest run per source, all of them or only the successful ones. */
function newestPerSource(db: Db, onlySuccessful: boolean) {
  return db
    .selectDistinctOn([syncRun.source])
    .from(syncRun)
    .where(onlySuccessful ? eq(syncRun.status, 'ok') : undefined)
    .orderBy(syncRun.source, desc(syncRun.startedAt));
}

/** What the freshness of each source is judged by. */
export async function lastRuns(db: Db): Promise<Record<SyncSource, LastRuns>> {
  const [successes, attempts] = await Promise.all([
    newestPerSource(db, true),
    newestPerSource(db, false),
  ]);
  const find = (runs: SyncRun[], source: SyncSource) =>
    runs.find((run) => run.source === source) ?? null;
  return {
    calendar: {
      lastSuccess: find(successes, 'calendar'),
      lastAttempt: find(attempts, 'calendar'),
    },
    budget: {
      lastSuccess: find(successes, 'budget'),
      lastAttempt: find(attempts, 'budget'),
    },
  };
}

/**
 * Deletes runs started more than `olderThanDays` days before `now`, except the last success of each
 * source, which still dates the cached data.
 */
export async function pruneRuns(
  db: Db,
  olderThanDays = 7,
  now: Date = new Date(),
): Promise<void> {
  const cutoff = new Date(now.getTime() - olderThanDays * 86_400_000);
  const keep = db
    .selectDistinctOn([syncRun.source], { id: syncRun.id })
    .from(syncRun)
    .where(eq(syncRun.status, 'ok'))
    .orderBy(syncRun.source, desc(syncRun.startedAt));
  await db
    .delete(syncRun)
    .where(and(lt(syncRun.startedAt, cutoff), notInArray(syncRun.id, keep)));
}
