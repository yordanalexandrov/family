# src

## Overview

Изходният код на `@family/shared`: общите типове, zod схеми и чиста домейн логика, които ползват и `apps/api`, и `apps/web`. `index.ts` изнася всичко публично от поддиректориите и `events.ts`; единствената външна зависимост е `zod`.

## Interface

- `index.ts` — `export *` от модулите на поддиректориите и `events.ts`; не изнася `contracts/preparation.ts`, `contracts/step-images.ts` и `contracts/strict-mode.ts`.
- `events.ts:serverEventSchema`, `ServerEvent`, `ServerEventType`, `SERVER_EVENT_TYPES` — сигналите на `GET /api/events` (Server-Sent Events): `menu.changed`, `menu.proposal.changed`, `shopping.changed`.
- [contracts](./contracts/README.md) — AI контрактите с OpenClaw агентите.
- [schemas](./schemas/README.md) — схемите на HTTP API-то и на състоянието на устройството.
- [food](./food/README.md) — единици, мащабиране, компоненти, подготовка, промени в Готвене, импорт на снимки, линк към източник.
- [menu](./menu/README.md) — седмицата, гласовете и съгласието по менюто, порциите, системните редове.
- [shopping](./shopping/README.md) — сглобяване на Списъка за пазаруване и ключовете на редовете.
- [dashboard](./dashboard/README.md) — софийско време, календарни събития, свежест, бюджет.
- [text](./text/README.md) — малки помощни функции за текст.

## Invariants

- `events.ts:serverEventSchema` — събитието носи само „това се промени“, никога данните; клиентът инвалидира заявките си и чете през REST; `weekStart` е понеделник (`weekStartSchema`), а `shopping.changed` без `weekStart` значи, че всички списъци са се променили (Килерът важи за всички седмици).
- `events.ts:SERVER_EVENT_TYPES` — изчислява се от опциите на `serverEventSchema`, затова нов вид събитие влиза в абонамента на клиента сам.

## Side Effects

- None. Кодът в `src` е чист: няма мрежа, диск, часовник или глобално състояние; функциите, които зависят от времето, получават `now` или `today` като параметър.

## Verification

- Run: `pnpm --filter @family/shared test`
