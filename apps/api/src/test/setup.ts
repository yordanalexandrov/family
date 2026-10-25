import { afterAll, beforeAll } from 'vitest';
import { runMigrations } from '../db/migrate.js';
import { closeTestDb, TEST_DATABASE_URL, testDb } from './db.js';

beforeAll(async () => {
  try {
    await runMigrations(testDb(), { timeoutMs: 5_000, intervalMs: 500 });
  } catch (error) {
    throw new Error(
      `Test database at ${TEST_DATABASE_URL} is not usable. Start it with: docker compose --profile test up -d postgres-test`,
      { cause: error },
    );
  }
});

afterAll(closeTestDb);
