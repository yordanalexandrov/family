import type { SyncRunResult } from '@family/shared';
import type { Db } from '../db/client.js';
import { insertSnapshot } from '../db/repositories/budget-snapshots.js';
import type { WalletClient } from '../integrations/wallet/client.js';
import { oneAtATime, type Sync } from './sync-mutex.js';
import { recordRun } from './sync-run.js';

export interface BudgetSyncDeps {
  db: Db;
  wallet: WalletClient;
  /** WALLET_BUDGET_ID: the family budget among those the token sees. */
  budgetId: string;
  now: () => Date;
}

/**
 * GLOSSARY: Синхронизация. Reads the current period of the family budget from Wallet and stores it as a new
 * `budget_snapshot`, recorded as one `sync_run`. On failure no snapshot is added and the last one stays current.
 */
export function syncBudget({
  db,
  wallet,
  budgetId,
  now,
}: BudgetSyncDeps): Promise<SyncRunResult> {
  return recordRun(db, 'budget', now, async () => {
    const budget = await wallet.getCurrentBudget(budgetId);
    await insertSnapshot(db, {
      walletBudgetId: budget.id,
      name: budget.name,
      periodStart: budget.periodStart,
      periodEnd: budget.periodEnd,
      limitAmount: budget.limit,
      spent: budget.spent,
      remaining: budget.remaining,
      currency: budget.currency,
      syncedAt: now(),
    });
    return undefined;
  });
}

/** The Wallet sync of the app: one run at a time, whether started by the scheduler or by hand. */
export function createBudgetSync(deps: BudgetSyncDeps): Sync {
  return oneAtATime('budget', () => syncBudget(deps));
}
