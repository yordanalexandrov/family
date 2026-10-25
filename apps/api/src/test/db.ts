import { readFile } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { closeDb, createDb, type Db } from '../db/client.js';

/** The throwaway Postgres from `docker compose --profile test up -d postgres-test`. */
export const TEST_DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  'postgres://family:test@127.0.0.1:5433/family';

/** The data migration that inserts Дани and Поли; re-run after every test so they are always there. */
const SEED_USERS_SQL = new URL(
  '../../drizzle/0001_seed_users.sql',
  import.meta.url,
);

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

/**
 * Empties every application table (all of `public`; Drizzle keeps its own in schema `drizzle`)
 * and re-applies the user seed, so each test starts from the migrated state.
 */
export async function resetDatabase(db: Db): Promise<void> {
  const { rows } = await db.execute<{ table_name: string }>(sql`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
  `);
  if (rows.length > 0) {
    const tables = sql.join(
      rows.map((row) => sql.identifier(row.table_name)),
      sql`, `,
    );
    await db.execute(sql`truncate ${tables} restart identity cascade`);
  }
  // The pool runs the file as one simple-protocol query, so its several statements are fine.
  await db.$client.query(await readFile(SEED_USERS_SQL, 'utf8'));
}
