import type { BudgetSnapshot } from '@family/shared';
import { desc } from 'drizzle-orm';
import type { Db } from '../client.js';
import { budgetSnapshot } from '../schema/dashboard.js';

export type NewBudgetSnapshot = typeof budgetSnapshot.$inferInsert;

/** Every successful sync adds a row; older rows stay as history. */
export async function insertSnapshot(
  db: Db,
  row: NewBudgetSnapshot,
): Promise<void> {
  await db.insert(budgetSnapshot).values(row);
}

/** The current snapshot: the newest by `synced_at`, or `null` before the first successful sync. */
export async function latestSnapshot(db: Db): Promise<BudgetSnapshot | null> {
  const [row] = await db
    .select()
    .from(budgetSnapshot)
    .orderBy(desc(budgetSnapshot.syncedAt))
    .limit(1);
  if (!row) {
    return null;
  }
  return {
    walletBudgetId: row.walletBudgetId,
    name: row.name,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    limit: row.limitAmount,
    spent: row.spent,
    remaining: row.remaining,
    currency: row.currency,
    syncedAt: row.syncedAt.toISOString(),
  };
}
