import { describe, expect, it, vi } from 'vitest';
import { TEST_DATABASE_URL } from '../test/db.js';
import { closeDb, createDb } from './client.js';
import { runMigrations } from './migrate.js';

function quietLog() {
  return { info: vi.fn(), warn: vi.fn() };
}

/** Code of the innermost cause: Drizzle wraps the pg error, whose `code` is the syscall or SQLSTATE. */
function rootCode(error: unknown): unknown {
  let current = error;
  while (current instanceof Error && current.cause !== undefined) {
    current = current.cause;
  }
  return (current as { code?: unknown } | null)?.code;
}

function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (error: unknown) => error,
  );
}

describe('runMigrations', () => {
  it('retries while Postgres refuses connections and gives up at the deadline', async () => {
    // Nothing listens on port 1.
    const db = createDb('postgres://family:test@127.0.0.1:1/family');
    const log = quietLog();
    try {
      const error = await rejectionOf(
        runMigrations(db, { log, timeoutMs: 300, intervalMs: 50 }),
      );

      expect(rootCode(error)).toBe('ECONNREFUSED');
      expect(log.warn.mock.calls.length).toBeGreaterThanOrEqual(2);
    } finally {
      await closeDb(db);
    }
  });

  it('fails at once on an error that is not about connecting (wrong password)', async () => {
    const url = new URL(TEST_DATABASE_URL);
    url.password = 'wrong';
    const db = createDb(url.href);
    const log = quietLog();
    try {
      const error = await rejectionOf(
        runMigrations(db, { log, timeoutMs: 5_000 }),
      );

      expect(rootCode(error)).toBe('28P01');
      expect(log.warn).not.toHaveBeenCalled();
    } finally {
      await closeDb(db);
    }
  });
});
