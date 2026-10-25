import { z } from 'zod';
import { dateKeySchema, instantSchema } from './dates.js';

/**
 * GLOSSARY: Бюджетна снимка. The family's monthly Wallet budget as last synced; amounts in `currency`,
 * the period from `periodStart` to `periodEnd`, both inclusive.
 */
export const budgetSnapshotSchema = z.object({
  walletBudgetId: z.string().min(1),
  name: z.string(),
  periodStart: dateKeySchema,
  periodEnd: dateKeySchema,
  limit: z.number(),
  spent: z.number(),
  remaining: z.number(),
  /** ISO 4217 code from Wallet; formatted with `Intl.NumberFormat`, never a hard-coded symbol. */
  currency: z.string().regex(/^[A-Z]{3}$/),
  syncedAt: instantSchema,
});

export type BudgetSnapshot = z.infer<typeof budgetSnapshotSchema>;
