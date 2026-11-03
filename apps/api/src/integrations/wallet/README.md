# integrations/wallet

## Overview

Клиент за REST API-то на BudgetBakers Wallet (ADR-0003). Чете текущия период на семейния бюджет за Бюджетната снимка на дашборда. Използва се от `src/services/budget-sync.ts`. Създава се в `src/server.ts` само при зададени `WALLET_API_TOKEN` и `WALLET_BUDGET_ID`.

## Interface

- `client.ts:createWalletClient` – `createWalletClient(token, { baseUrl })`: клиентът за Bearer token-а от `WALLET_API_TOKEN`; `baseUrl` е по подразбиране `BASE_URL`.
- `client.ts:WalletClient` – `getCurrentBudget(budgetId)`, текущият период на един бюджет.
- `client.ts:walletBudgetSchema` – zod схемата на бюджета, както го връща `GET /v1/api/budgets?spending=current&id=<budgetId>`.
- `client.ts:WalletBudget` – числата, които показва дашбордът.
- `client.ts:WalletError, WalletErrorCode` – грешка на Wallet; съобщението започва с кода – точно един от `wallet_unauthorized`, `wallet_error`, `budget_not_found`, `budget_incomplete`.

## Invariants

- `client.ts:walletBudgetSchema` (коментар) – `periodStart` и `periodEnd` са `YYYY-MM-DD` и включват и двата края. `spent` и `remaining` са `null`, когато периодът е `incomplete` (липсва обменен курс). `toWalletBudget` хвърля `WalletError('budget_incomplete')`, когато няма `spending.current`, когато е `incomplete` или когато `periodStart`, `periodEnd`, `spent` или `remaining` е `null`.
- `client.ts:createWalletClient` – 401 е `wallet_unauthorized`. 5xx и мрежовите грешки (вкл. timeout) имат точно един повторен опит. Друг статус или неочакван отговор е `wallet_error`. Бюджет, който го няма в отговора, е `budget_not_found`.
- `client.ts:WalletError` (коментар) – съобщението никога не цитира token-а.
- `client.ts:REQUEST_TIMEOUT_MS` – 15 s на заявка (`AbortSignal.timeout`).

## Side Effects

- Мрежа: HTTPS `GET` към `https://rest.budgetbakers.com/wallet`.

## Verification

- Run: `pnpm --filter api test` (локално няма specs; Синхронизацията на бюджета се тества в `src/services`).
