import type { SyncRunResult, SyncSource } from '@family/shared';

/** A sync of one source: one run at a time, whether started by the scheduler or by hand. */
export interface Sync {
  /** Runs a sync, or answers `running` without starting one when a sync is already under way. */
  run(): Promise<SyncRunResult>;
}

/** Wraps `sync` so a call made while a previous one is still under way answers `running` instead. */
export function oneAtATime(
  source: SyncSource,
  sync: () => Promise<SyncRunResult>,
): Sync {
  let running = false;
  return {
    async run() {
      if (running) {
        return { source, status: 'running' };
      }
      running = true;
      try {
        return await sync();
      } finally {
        running = false;
      }
    },
  };
}
