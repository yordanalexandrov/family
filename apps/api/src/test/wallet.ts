import { HttpResponse, http } from 'msw';
import budgetsCurrent from './fixtures/wallet/budgets-current.json' with {
  type: 'json',
};

/** The Wallet REST API as the specs reach it; msw answers instead of BudgetBakers. */
export const WALLET_BASE_URL = 'https://rest.budgetbakers.com/wallet';

/** WALLET_API_TOKEN of the specs; the mocked endpoint accepts only this one. */
export const TEST_WALLET_TOKEN = 'test-wallet-token';

/** WALLET_BUDGET_ID of the specs: the family budget of the fixture (the other one is a groceries budget). */
export const TEST_BUDGET_ID = 'test-budget-family';

/** One budget of a `GET /v1/api/budgets` answer; the fields the specs change are typed, the rest passed through. */
type BudgetJson = Record<string, unknown> & {
  id: string;
  spending: Record<string, unknown> & { current: Record<string, unknown> };
};

/** A `GET /v1/api/budgets` answer, as Wallet sends it. */
export type BudgetsPage = Record<string, unknown> & { budgets: BudgetJson[] };

export const BUDGETS_CURRENT: BudgetsPage = budgetsCurrent;

type Respond = (request: Request) => Response | Promise<Response>;

/** `GET /v1/api/budgets` answered by `respond`; `{ once: true }` answers one request only. */
export function budgetsEndpoint(
  respond: Respond,
  options?: { once?: boolean },
) {
  return http.get(
    `${WALLET_BASE_URL}/v1/api/budgets`,
    ({ request }) => respond(request),
    options,
  );
}

/**
 * Wallet's budgets list with `page` (the fixture by default): only with the test token, and like the real API
 * it filters by `?id=` and leaves out the spending block unless `?spending=current` is asked for.
 */
export function budgetsHandler(page: BudgetsPage = BUDGETS_CURRENT) {
  return budgetsEndpoint((request) => {
    if (
      request.headers.get('authorization') !== `Bearer ${TEST_WALLET_TOKEN}`
    ) {
      return HttpResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 },
      );
    }
    const url = new URL(request.url);
    const ids = url.searchParams.get('id')?.split(',');
    const withSpending = url.searchParams.get('spending') === 'current';
    const budgets = page.budgets
      .filter((budget) => !ids || ids.includes(budget.id))
      .map(({ spending, ...budget }) =>
        withSpending ? { ...budget, spending } : budget,
      );
    return HttpResponse.json({ ...page, budgets });
  });
}

/** The fixture with the family budget's current period changed by `current`. */
export function withFamilyPeriod(
  current: Record<string, unknown>,
): BudgetsPage {
  return {
    ...BUDGETS_CURRENT,
    budgets: BUDGETS_CURRENT.budgets.map((budget) =>
      budget.id === TEST_BUDGET_ID
        ? {
            ...budget,
            spending: {
              ...budget.spending,
              current: { ...budget.spending.current, ...current },
            },
          }
        : budget,
    ),
  };
}
