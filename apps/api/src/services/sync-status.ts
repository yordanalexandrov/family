import { freshness, type SyncSource, type SyncStatus } from '@family/shared';
import type { Db } from '../db/client.js';
import { lastRuns } from '../db/repositories/sync-runs.js';

/** Which sources have their config (GOOGLE_* / WALLET_*); a source without it is `unconfigured`. */
export type ConfiguredSources = Record<SyncSource, boolean>;

/** GLOSSARY: Остарели данни. How fresh the cached data of each source is, judged by its `sync_run` rows. */
export async function readSyncStatuses(
  db: Db,
  configured: ConfiguredSources,
  now: Date,
): Promise<Record<SyncSource, SyncStatus>> {
  const runs = await lastRuns(db);
  const statusOf = (source: SyncSource): SyncStatus => {
    const { lastSuccess, lastAttempt } = runs[source];
    const status = freshness(
      lastSuccess?.finishedAt ?? null,
      configured[source] ? (lastAttempt?.status ?? null) : 'unconfigured',
      source,
      now,
    );
    return {
      source,
      status,
      lastSuccessAt: lastSuccess?.finishedAt?.toISOString() ?? null,
      lastError: status === 'failed' ? (lastAttempt?.error ?? null) : null,
    };
  };
  return { calendar: statusOf('calendar'), budget: statusOf('budget') };
}
