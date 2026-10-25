import { DAY_MS, type SyncSource } from '@family/shared';
import { and, desc, eq, lt, ne, notInArray } from 'drizzle-orm';
import type { Db } from '../client.js';
import { syncRun } from '../schema/dashboard.js';

export type SyncRun = typeof syncRun.$inferSelect;

/** The newest successful run and the newest finished one (`ok` or `failed`; a run still `running` is skipped). */
export interface LastRuns {
  lastSuccess: SyncRun | null;
  lastFinished: SyncRun | null;
}

/** Records the start of a sync of `source`; returns the run's id for `finishRun`. */
export async function startRun(
  db: Db,
  source: SyncSource,
  startedAt: Date,
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
  error: string | undefined,
  finishedAt: Date,
): Promise<void> {
  await db
    .update(syncRun)
    .set({ status, error: error ?? null, finishedAt })
    .where(eq(syncRun.id, id));
}

/** The newest run per source, only the successful ones or all finished ones. */
function newestPerSource(db: Db, onlySuccessful: boolean) {
  return db
    .selectDistinctOn([syncRun.source])
    .from(syncRun)
    .where(
      onlySuccessful ? eq(syncRun.status, 'ok') : ne(syncRun.status, 'running'),
    )
    .orderBy(syncRun.source, desc(syncRun.startedAt));
}

/** What the freshness of each source is judged by. */
export async function lastRuns(db: Db): Promise<Record<SyncSource, LastRuns>> {
  const [successes, finished] = await Promise.all([
    newestPerSource(db, true),
    newestPerSource(db, false),
  ]);
  const find = (runs: SyncRun[], source: SyncSource) =>
    runs.find((run) => run.source === source) ?? null;
  return {
    calendar: {
      lastSuccess: find(successes, 'calendar'),
      lastFinished: find(finished, 'calendar'),
    },
    budget: {
      lastSuccess: find(successes, 'budget'),
      lastFinished: find(finished, 'budget'),
    },
  };
}

/**
 * Deletes runs started more than `olderThanDays` days before `now`, except the last success of each
 * source, which still dates the cached data.
 */
export async function pruneRuns(
  db: Db,
  olderThanDays: number,
  now: Date,
): Promise<void> {
  const cutoff = new Date(now.getTime() - olderThanDays * DAY_MS);
  const keep = db
    .selectDistinctOn([syncRun.source], { id: syncRun.id })
    .from(syncRun)
    .where(eq(syncRun.status, 'ok'))
    .orderBy(syncRun.source, desc(syncRun.startedAt));
  await db
    .delete(syncRun)
    .where(and(lt(syncRun.startedAt, cutoff), notInArray(syncRun.id, keep)));
}
