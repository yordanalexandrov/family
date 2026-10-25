import type { Freshness, LastRunStatus, SyncSource } from '../schemas/sync.js';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Age of the last successful sync after which a source's data counts as stale. */
export const STALE_AFTER_MS: Record<SyncSource, number> = {
  calendar: 20 * MINUTE_MS,
  budget: 3 * HOUR_MS,
};

/**
 * How fresh a source's data is. In order: `unconfigured` when the source has no config,
 * `failed` when the latest attempt failed, `stale` when nothing has succeeded yet or the last success
 * is older than `STALE_AFTER_MS[source]`, otherwise `ok`. A run in progress does not change the answer.
 */
export function freshness(
  lastSuccessAt: Date | string | null,
  lastStatus: LastRunStatus | null,
  source: SyncSource,
  now: Date,
): Freshness {
  if (lastStatus === 'unconfigured') {
    return 'unconfigured';
  }
  if (lastStatus === 'failed') {
    return 'failed';
  }
  if (lastSuccessAt === null) {
    return 'stale';
  }
  const age = now.getTime() - new Date(lastSuccessAt).getTime();
  return age > STALE_AFTER_MS[source] ? 'stale' : 'ok';
}

/** How long ago `from` was, for the screen: „току-що“, „преди 3 мин“, „преди 2 ч“, „преди 1 д“. */
export function formatAge(from: Date | string, now: Date): string {
  const age = now.getTime() - new Date(from).getTime();
  if (age < MINUTE_MS) {
    return 'току-що';
  }
  if (age < HOUR_MS) {
    return `преди ${Math.floor(age / MINUTE_MS)} мин`;
  }
  if (age < DAY_MS) {
    return `преди ${Math.floor(age / HOUR_MS)} ч`;
  }
  return `преди ${Math.floor(age / DAY_MS)} д`;
}
