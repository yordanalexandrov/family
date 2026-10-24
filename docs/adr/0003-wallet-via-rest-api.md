---
status: accepted
date: 2026-10-25
---

# Бюджетът идва от Wallet REST API, не от Wallet MCP

concept.md избира Wallet MCP („MCP-то е достатъчно“). Оказа се, че BudgetBakers предлагат и REST API (`https://rest.budgetbakers.com/wallet`, OpenAPI на `/openapi`) с Bearer токен, генериран в Wallet Settings → REST API (Premium план), където `GET /v1/api/budgets?spending=current` връща `effectiveLimit`, `spent`, `remaining` за текущия период. Избираме REST: чист HTTP вместо MCP клиент в сървъра, документирана схема и без зависимост от claude.ai. Лимитът е 300 заявки/час, споделен с MCP; една заявка на час е достатъчна за `budget_snapshot`.
