# packages/shared

## Overview

Пакетът `@family/shared` (частен, `type: module`) е общият код на `apps/api` и `apps/web`: zod схемите на HTTP API-то, AI контрактите с OpenClaw агентите, сигналите на Server-Sent Events и чистата домейн логика за храна, меню, пазаруване и табло. Публичният вход е `exports["."]` в `package.json` (`./dist/index.js` с типове `./dist/index.d.ts`), построен от `src/index.ts` с `tsc -b tsconfig.build.json`. Единствената runtime зависимост е `zod`. Скриптове: `build`, `typecheck`, `test` (vitest), `lint` (biome).

## Subdirectories & Boundaries

- src: [./src/README.md](./src/README.md) - целият изходен код; `index.ts` изнася публичния интерфейс, `events.ts` описва сигналите на `GET /api/events`, а поддиректориите `contracts`, `schemas`, `food`, `menu`, `shopping`, `dashboard` и `text` държат съответно AI контрактите, схемите на API-то и чистата логика. Кодът е чист, без странични ефекти.

## Verification

- Run: `pnpm --filter @family/shared test`
