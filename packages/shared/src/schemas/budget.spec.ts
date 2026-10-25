import { describe, expect, it } from 'vitest';
import { budgetSnapshotSchema } from './budget.js';

const snapshot = {
  walletBudgetId: 'budget-1',
  name: 'Семеен бюджет',
  periodStart: '2026-10-01',
  periodEnd: '2026-10-31',
  limit: 3000,
  spent: 1800.5,
  remaining: 1199.5,
  currency: 'EUR',
  syncedAt: '2026-10-25T09:00:00.000Z',
};

describe('budgetSnapshotSchema', () => {
  it('accepts a Wallet budget with amounts as numbers', () => {
    expect(budgetSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  });

  it('rejects amounts sent as strings (numeric columns must be converted)', () => {
    const result = budgetSnapshotSchema.safeParse({
      ...snapshot,
      spent: '1800.50',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual([
      'spent',
    ]);
  });

  it('rejects a currency that is not an ISO 4217 code', () => {
    expect(
      budgetSnapshotSchema.safeParse({ ...snapshot, currency: 'лв' }).success,
    ).toBe(false);
  });
});
