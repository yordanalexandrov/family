import type { ContractFailure } from '@family/shared';
import { and, eq, lt } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { DbExecutor } from '../client.js';

/**
 * Any table of AI requests (GLOSSARY: AI заявка): one that spreads `contractRequestColumns()` from
 * `db/schema/columns.ts`, so these functions work for every contract.
 */
export type ContractRequestTable = PgTable & {
  id: AnyPgColumn;
  status: AnyPgColumn;
  error: AnyPgColumn;
  createdAt: AnyPgColumn;
  finishedAt: AnyPgColumn;
};

/** Sets the final status (`done`, or `failed` with a short error code) and `finished_at`. */
export async function finishContractRequest(
  db: DbExecutor,
  table: ContractRequestTable,
  id: string,
  outcome: { status: 'done' } | { status: 'failed'; error: ContractFailure },
): Promise<void> {
  await db
    .update(table)
    .set({
      status: outcome.status,
      error: outcome.status === 'failed' ? outcome.error : null,
      finishedAt: new Date(),
    })
    .where(eq(table.id, id));
}

/** Requests still `pending` that were created before `cutoff` become `failed` with `error`; returns how many. */
export async function failPendingContractRequestsBefore(
  db: DbExecutor,
  table: ContractRequestTable,
  cutoff: Date,
  error: ContractFailure,
): Promise<number> {
  const rows = await db
    .update(table)
    .set({ status: 'failed', error, finishedAt: new Date() })
    .where(and(eq(table.status, 'pending'), lt(table.createdAt, cutoff)))
    .returning({ id: table.id });
  return rows.length;
}
