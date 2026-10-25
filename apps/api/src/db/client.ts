import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

export type Db = NodePgDatabase & { $client: Pool };

/**
 * Opens a connection pool to `databaseUrl` and wraps it in Drizzle.
 * `onPoolError` receives errors of idle connections (e.g. Postgres restarting); without it they crash the process.
 */
export function createDb(
  databaseUrl: string,
  onPoolError?: (error: Error) => void,
): Db {
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
  });
  if (onPoolError) {
    pool.on('error', onPoolError);
  }
  return drizzle({ client: pool });
}

export async function closeDb(db: Db): Promise<void> {
  await db.$client.end();
}

/** Round trip to Postgres (`SELECT 1`); rejects when the database is unreachable. */
export async function pingDb(db: Db): Promise<void> {
  await db.execute(sql`select 1`);
}
