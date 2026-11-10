import { afterAll, afterEach, beforeAll } from 'vitest';
import { runMigrations } from '../db/migrate.js';
import { settleTestApps } from './app.js';
import {
  closeTestDb,
  ensureTestDatabase,
  resetDatabase,
  TEST_DATABASE_URL,
  testDb,
} from './db.js';

beforeAll(async () => {
  try {
    await ensureTestDatabase();
    await runMigrations(testDb(), { timeoutMs: 5_000, intervalMs: 500 });
  } catch (error) {
    throw new Error(
      `Test database at ${TEST_DATABASE_URL} is not usable. Start it with: docker compose -p family-test --profile test up -d postgres-test`,
      { cause: error },
    );
  }
  // Earlier runs (or a killed one) may have left data behind.
  await resetDatabase(testDb());
});

// Background AI runs of the test first (they write after its 202), then the truncate: one hook, so the order holds.
afterEach(async () => {
  await settleTestApps();
  await resetDatabase(testDb());
});

afterAll(closeTestDb);
