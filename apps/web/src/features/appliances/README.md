# appliances — уреди на домакинството

## Overview
Само слой за данни на уредите (вж. „Уред“ в глосара): списък и мутации за включване, добавяне и махане, плюс кратко име на уред. Ползва се от `features/settings` (секция „Уреди“), от формата за рецепта и `ApplianceBadge` в `features/recipes`, и от `features/suggestions/SuggestForm.tsx`.

## Interface
- `queries.ts:applianceKeys` — ключ на кеша `['appliances']`
- `queries.ts:useAppliances` — списъкът уреди
- `queries.ts:useSwitchAppliance`, `queries.ts:useAddAppliance`, `queries.ts:useRemoveAppliance` — включване, добавяне (и „Върни“), махане
- `queries.ts:applianceShortName` — частта преди ` (` или ` — `, иначе цялото име

## Invariants
- `queries.ts:optimisticList` — превключването и махането са оптимистични: спират се заявките, пази се предишният списък и се връща при грешка; `onSettled` винаги инвалидира `applianceKeys.all`
- `queries.ts:useAddAppliance` — не е оптимистично, само инвалидира след завършване

## Side Effects
- `queries.ts:useAppliances` — GET `/api/appliances`
- `queries.ts:useSwitchAppliance` — PUT `/api/appliances/:id` с `{ enabled }`
- `queries.ts:useAddAppliance` — POST `/api/appliances` с `{ name, enabled? }`
- `queries.ts:useRemoveAppliance` — DELETE `/api/appliances/:id`

## Verification
- Run: `pnpm --filter web test` (директорията няма собствени `*.spec.*`)
- Типове: `pnpm --filter web typecheck`
