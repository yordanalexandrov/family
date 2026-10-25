import type { SyncRunResult, SyncSource } from '@family/shared';
import type { Db } from '../db/client.js';
import { finishRun, startRun } from '../db/repositories/sync-runs.js';

/** The message of something thrown, for `sync_run.error`. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Runs one sync of `source` recorded as a `sync_run`. `sync` gets the start time and answers the error of a
 * partial failure (or `undefined`); a throw fails the run with its message. Either way the run is finished.
 */
export async function recordRun(
  db: Db,
  source: SyncSource,
  now: () => Date,
  sync: (startedAt: Date) => Promise<string | undefined>,
): Promise<SyncRunResult> {
  const startedAt = now();
  const runId = await startRun(db, source, startedAt);
  let error: string | undefined;
  try {
    error = await sync(startedAt);
  } catch (caught) {
    error = messageOf(caught);
  }
  const finishedAt = now();
  await finishRun(db, runId, error ? 'failed' : 'ok', error, finishedAt);
  const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());
  return error
    ? { source, status: 'failed', durationMs, error }
    : { source, status: 'ok', durationMs };
}
