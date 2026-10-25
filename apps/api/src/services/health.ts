import type { Health } from '@family/shared';
import type { FastifyBaseLogger } from 'fastify';
import { type Db, pingDb } from '../db/client.js';
import { type ConfiguredSources, readSyncStatuses } from './sync-status.js';

/**
 * GLOSSARY: Здрав статус. `ok` while Postgres answers `SELECT 1`, otherwise `degraded` with the cause logged.
 * `sync` adds how fresh each source is; it never changes `status`, and is left out while the database is down.
 */
export async function checkHealth(
  db: Db,
  log: Pick<FastifyBaseLogger, 'error'>,
  configured: ConfiguredSources,
  now: Date,
): Promise<Health> {
  try {
    await pingDb(db);
  } catch (error) {
    log.error({ err: error }, 'database ping failed');
    return { status: 'degraded', db: 'down' };
  }
  try {
    const sync = await readSyncStatuses(db, configured, now);
    return {
      status: 'ok',
      db: 'ok',
      sync: { calendar: sync.calendar.status, budget: sync.budget.status },
    };
  } catch (error) {
    log.error({ err: error }, 'reading sync runs failed');
    return { status: 'ok', db: 'ok' };
  }
}
