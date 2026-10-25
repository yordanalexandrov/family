import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { closeDb, createDb, type Db } from '../db/client.js';
import { dataMigrations } from '../db/seed/migrations.js';

/** The throwaway Postgres server from `docker compose --profile test up -d postgres-test`. */
const TEST_SERVER_URL =
  process.env.DATABASE_URL_TEST ??
  'postgres://family:test@127.0.0.1:5433/family';

/**
 * The test database of this checkout: same server, own database `family_<hash of the checkout path>`, so parallel
 * worktrees never truncate each other's tables. Created by {@link ensureTestDatabase}.
 */
export const TEST_DATABASE_URL = (() => {
  const checkout = fileURLToPath(new URL('../../../..', import.meta.url));
  const url = new URL(TEST_SERVER_URL);
  url.pathname = `/family_${createHash('sha256').update(checkout).digest('hex').slice(0, 12)}`;
  return url.href;
})();

/** Creates this checkout's test database on the test server when it is not there yet. */
export async function ensureTestDatabase(): Promise<void> {
  const name = new URL(TEST_DATABASE_URL).pathname.slice(1);
  const client = new pg.Client({ connectionString: TEST_SERVER_URL });
  await client.connect();
  try {
    const { rowCount } = await client.query(
      'select 1 from pg_database where datname = $1',
      [name],
    );
    if (!rowCount) {
      await client.query(`create database "${name}"`).catch((error) => {
        // 42P04 duplicate_database: another run of this checkout created it first.
        if (error?.code !== '42P04') throw error;
      });
    }
  } finally {
    await client.end();
  }
}

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
