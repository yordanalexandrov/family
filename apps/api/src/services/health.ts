import type { Health } from '@family/shared';
import type { FastifyBaseLogger } from 'fastify';
import { type Db, pingDb } from '../db/client.js';

/** GLOSSARY: Здрав статус. `ok` while Postgres answers `SELECT 1`, otherwise `degraded` with the cause logged. */
export async function checkHealth(
  db: Db,
  log: Pick<FastifyBaseLogger, 'error'>,
): Promise<Health> {
  try {
    await pingDb(db);
    return { status: 'ok', db: 'ok' };
  } catch (error) {
    log.error({ err: error }, 'database ping failed');
    return { status: 'degraded', db: 'down' };
  }
}
