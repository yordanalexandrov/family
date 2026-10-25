import { z } from 'zod';

/** BudgetBakers' Wallet REST API (ADR-0003); its OpenAPI is at `${BASE_URL}/openapi`. */
const BASE_URL = 'https://rest.budgetbakers.com/wallet';
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * The current period of one budget as `GET /v1/api/budgets?spending=current` returns it (OpenAPI schemas
 * `Budget` and `BudgetPeriodSpending`). Amounts are in `currencyCode`, the budget's own currency.
 * `periodStart`/`periodEnd` are `YYYY-MM-DD`, both inclusive (October is 2026-10-01 … 2026-10-31); the
 * OpenAPI types them as plain nullable strings, the format is from Wallet's budgets guide and a real answer.
 * `spent`, `remaining` are `null` when the period is `incomplete` (an exchange rate is missing).
 */
export const walletBudgetSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  spending: z
    .object({
      current: z
        .object({
          periodStart: z.iso.date().nullable(),
          periodEnd: z.iso.date().nullable(),
          /** The limit in force for this period (overrides applied); not the budget's base `limit`. */
          effectiveLimit: z.number(),
          spent: z.number().nullable(),
          /** `effectiveLimit − spent`, negative when overspent. */
          remaining: z.number().nullable(),
          incomplete: z.boolean().optional(),
        })
        .nullable(),
    })
    .optional(),
});

const budgetsPageSchema = z.object({
  budgets: z.array(z.unknown()),
});

/** The numbers the dashboard shows: the current period of the family budget. */
export interface WalletBudget {
  id: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  limit: number;
  spent: number;
  remaining: number;
  currency: string;
}

export type WalletErrorCode =
  /** 401: the token is wrong or expired. Not retried. */
  | 'wallet_unauthorized'
  /** WALLET_BUDGET_ID is not among the budgets the token sees. */
  | 'budget_not_found'
  /** The budget has no current period, or Wallet could not compute it (`incomplete`). */
  | 'budget_incomplete'
  /** Any other answer Wallet should not give. */
  | 'wallet_error';

/** A Wallet failure; its message starts with the code and never quotes the token. */
export class WalletError extends Error {
  readonly code: WalletErrorCode;

  constructor(code: WalletErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'WalletError';
    this.code = code;
  }
}

export interface WalletClient {
  /** The current period of budget `budgetId`. */
  getCurrentBudget(budgetId: string): Promise<WalletBudget>;
}

/** 5xx and network failures (a timeout included) get one more attempt. */
class Retryable extends Error {}

function toWalletBudget(raw: unknown, budgetId: string): WalletBudget {
  const result = walletBudgetSchema.safeParse(raw);
  if (!result.success) {
    throw new WalletError(
      'wallet_error',
      `unexpected budget shape: ${z.prettifyError(result.error)}`,
    );
  }
  const { id, name, currencyCode, spending } = result.data;
  const current = spending?.current;
  if (
    !current ||
    current.incomplete ||
    current.periodStart === null ||
    current.periodEnd === null ||
    current.spent === null ||
    current.remaining === null
  ) {
    throw new WalletError('budget_incomplete', budgetId);
  }
  return {
    id,
    name,
    periodStart: current.periodStart,
    periodEnd: current.periodEnd,
    limit: current.effectiveLimit,
    spent: current.spent,
    remaining: current.remaining,
    currency: currencyCode,
  };
}

/** Wallet read with the REST API token of WALLET_API_TOKEN (a Bearer JWT from Wallet Settings → REST API). */
export function createWalletClient(
  token: string,
  { baseUrl = BASE_URL }: { baseUrl?: string } = {},
): WalletClient {
  async function attempt(url: string): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new Retryable(
        error instanceof Error ? error.message : String(error),
      );
    }
    if (response.status === 401) {
      throw new WalletError('wallet_unauthorized');
    }
    if (response.status >= 500) {
      throw new Retryable(`HTTP ${response.status}`);
    }
    if (!response.ok) {
      throw new WalletError('wallet_error', `HTTP ${response.status}`);
    }
    return response.json();
  }

  async function get(url: string): Promise<unknown> {
    try {
      return await attempt(url);
    } catch (error) {
      if (!(error instanceof Retryable)) {
        throw error;
      }
      try {
        return await attempt(url);
      } catch (retryError) {
        if (retryError instanceof Retryable) {
          throw new WalletError('wallet_error', retryError.message);
        }
        throw retryError;
      }
    }
  }

  return {
    async getCurrentBudget(budgetId) {
      // `id` narrows the list to the one budget, so there is no paging; the match is still checked.
      const params = new URLSearchParams({ spending: 'current', id: budgetId });
      const page = budgetsPageSchema.safeParse(
        await get(`${baseUrl}/v1/api/budgets?${params}`),
      );
      if (!page.success) {
        throw new WalletError('wallet_error', 'unexpected budgets answer');
      }
      const raw = page.data.budgets.find(
        (budget) =>
          typeof budget === 'object' &&
          budget !== null &&
          'id' in budget &&
          budget.id === budgetId,
      );
      if (!raw) {
        throw new WalletError('budget_not_found', budgetId);
      }
      return toWalletBudget(raw, budgetId);
    },
  };
}
