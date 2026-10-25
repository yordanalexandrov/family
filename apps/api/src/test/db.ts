import { closeDb, createDb, type Db } from '../db/client.js';

/** The throwaway Postgres from `docker compose --profile test up -d postgres-test`. */
export const TEST_DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  'postgres://family:test@127.0.0.1:5433/family';

let db: Db | undefined;

/** One pool to the test database per worker; `src/test/setup.ts` migrates it and closes it. */
export function testDb(): Db {
  db ??= createDb(TEST_DATABASE_URL);
  return db;
}

export async function closeTestDb(): Promise<void> {
  if (db) {
    await closeDb(db);
    db = undefined;
  }
}
