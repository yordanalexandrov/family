import type { SyncRunResult } from '@family/shared';
import type { Db } from '../db/client.js';
import { insertSnapshot } from '../db/repositories/budget-snapshots.js';
import { finishRun, startRun } from '../db/repositories/sync-runs.js';
import type { WalletClient } from '../integrations/wallet/client.js';
import { oneAtATime, type Sync } from './sync-mutex.js';

export interface BudgetSyncDeps {
  db: Db;
  wallet: WalletClient;
  /** WALLET_BUDGET_ID: the family budget among those the token sees. */
  budgetId: string;
  now: () => Date;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * GLOSSARY: Синхронизация. Reads the current period of the family budget from Wallet and stores it as a new
 * `budget_snapshot`, recorded as one `sync_run`. On failure no snapshot is added and the last one stays current.
 */
export async function syncBudget({
  db,
  wallet,
  budgetId,
  now,
}: BudgetSyncDeps): Promise<SyncRunResult> {
  const startedAt = now();
  const runId = await startRun(db, 'budget', startedAt);
  let error: string | undefined;
  try {
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
  } catch (caught) {
    error = messageOf(caught);
  }
  const finishedAt = now();
  await finishRun(db, runId, error ? 'failed' : 'ok', error, finishedAt);
  const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());
  return error
    ? { source: 'budget', status: 'failed', durationMs, error }
    : { source: 'budget', status: 'ok', durationMs };
}

/** The Wallet sync of the app: one run at a time, whether started by the scheduler or by hand. */
export function createBudgetSync(deps: BudgetSyncDeps): Sync {
  return oneAtATime('budget', () => syncBudget(deps));
}
