import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from './client.js';

/** `apps/api/drizzle`, both from `src/` (tsx, vitest) and from `dist/` (production). */
const MIGRATIONS_FOLDER = fileURLToPath(
  new URL('../../drizzle', import.meta.url),
);

export interface RunMigrationsOptions {
  log?: Pick<FastifyBaseLogger, 'info' | 'warn'>;
  /** Give up after this long waiting for Postgres to accept connections. */
  timeoutMs?: number;
  /** Pause between attempts. */
  intervalMs?: number;
}

const silentLog: NonNullable<RunMigrationsOptions['log']> = {
  info() {},
  warn() {},
};

/**
 * Applies the migrations in `drizzle/`, retrying while Postgres is not yet accepting
 * connections (locally it may still be starting). Any other error is rethrown at once.
 */
export async function runMigrations(
  db: Db,
  {
    log = silentLog,
    timeoutMs = 30_000,
    intervalMs = 1_000,
  }: RunMigrationsOptions = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  for (let attempt = 1; ; attempt++) {
    try {
      await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
      log.info(
        { migrationsFolder: MIGRATIONS_FOLDER },
        'database migrations applied',
      );
      return;
    } catch (error) {
      if (!isConnectionError(error) || Date.now() + intervalMs > deadline) {
        throw error;
      }
      log.warn(
        { attempt, retryInMs: intervalMs, reason: rootMessage(error) },
        'database not accepting connections yet, retrying',
      );
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
}

/** Node socket errors and Postgres connection-exception SQLSTATEs (class 08, 57P03 "starting up"). */
const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  '57P03',
]);

/** Drizzle wraps driver errors (`DrizzleQueryError` → `cause`), so the chain is walked down to the socket/Postgres error. */
function isConnectionError(error: unknown): boolean {
  if (error instanceof AggregateError) {
    return error.errors.some(isConnectionError);
  }
  const code = (error as { code?: unknown } | null)?.code;
  if (
    typeof code === 'string' &&
    (CONNECTION_ERROR_CODES.has(code) || code.startsWith('08'))
  ) {
    return true;
  }
  return error instanceof Error && error.cause !== undefined
    ? isConnectionError(error.cause)
    : false;
}

/** Message of the innermost cause, e.g. `connect ECONNREFUSED 127.0.0.1:5432` rather than Drizzle's "Failed query". */
function rootMessage(error: unknown): string {
  let current = error;
  while (current instanceof Error && current.cause !== undefined) {
    current = current.cause;
  }
  return current instanceof Error ? current.message : String(current);
}
