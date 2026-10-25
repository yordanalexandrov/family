import { readFile } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { closeDb, createDb, type Db } from '../db/client.js';
import { dataMigrations } from '../db/seed/migrations.js';

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

/**
 * Empties every application table (all of `public`; Drizzle keeps its own in schema `drizzle`)
 * and re-applies the data migrations, so each test starts from the migrated state.
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
  // The pool runs each file as one simple-protocol query, so several statements are fine.
  // The data migrations (`<n>_seed_*`: Дани and Поли, the seed ingredients) are idempotent (`on conflict do nothing`).
  for (const migration of await dataMigrations()) {
    await db.$client.query(await readFile(migration.path, 'utf8'));
  }
}
