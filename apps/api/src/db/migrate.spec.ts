import { describe, expect, it, vi } from 'vitest';
import { TEST_DATABASE_URL } from '../test/db.js';
import { closeDb, createDb } from './client.js';
import { runMigrations } from './migrate.js';

function quietLog() {
  return { info: vi.fn(), warn: vi.fn() };
}

describe('runMigrations', () => {
  it('retries while Postgres refuses connections and gives up at the deadline', async () => {
    // Nothing listens on port 1.
    const db = createDb('postgres://family:test@127.0.0.1:1/family');
    const log = quietLog();
    try {
      await expect(
        runMigrations(db, { log, timeoutMs: 300, intervalMs: 50 }),
      ).rejects.toThrow();

      expect(log.warn.mock.calls.length).toBeGreaterThanOrEqual(2);
      // Every retry names the refused connection, not Drizzle's "Failed query" around it.
      expect(log.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: expect.stringContaining('ECONNREFUSED'),
        }),
        expect.any(String),
      );
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
      await expect(
        runMigrations(db, { log, timeoutMs: 5_000 }),
      ).rejects.toThrow();

      expect(log.warn).not.toHaveBeenCalled();
    } finally {
      await closeDb(db);
    }
  });
});
