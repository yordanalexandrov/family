# api

## Overview

Пакетът `api` е Fastify сървърът на семейната платформа. Той е единственият процес, който пише в Postgres (Drizzle ORM). Обслужва REST `/api/*` зад Cloudflare Access и `/healthz` и пуска собствен cron: Синхронизация с Google Calendar и Wallet, Предложение за меню, Напомняния, почистване. Праща AI заявки към OpenClaw и Известия през Web Push. Договорите (zod схемите на API-то и AI контрактите) идват от `packages/shared` (`@family/shared`). Клиентът е `apps/web`.

## Interface

- `package.json` – скриптове:
  - `dev` (`tsx watch src/server.ts` с `../../.env`), `build` (`tsc -b tsconfig.build.json` в `dist`), `start` (`node dist/server.js`).
  - `test` (`vitest run`), `typecheck`, `lint` (`biome ci .`).
  - `db:generate`, `db:migrate`, `db:studio` (drizzle-kit), `db:seed-ingredients`.
  - `calendar:probe`, `vapid-keys`.
  - Smoke тестове: `suggest:smoke`, `menu:smoke`, `meal:smoke`, `import:smoke`, `refine:smoke`, `ask:smoke`, `revise:smoke`.
- `drizzle.config.ts` (default `defineConfig`) – `dialect: 'postgresql'`, схема `./src/db/schema/index.ts`, изход `./drizzle`, `DATABASE_URL` от средата или от `../../.env`.
- `vitest.config.ts` (default `defineConfig`) – `src/**/*.spec.ts`, setup `./src/test/setup.ts`, aliases `@family/shared` и `@family/shared/fixtures` към изходния код на `packages/shared`.
- `tsconfig.json` (typecheck на `src`, `scripts`, config файловете) и `tsconfig.build.json` (компилира `src` без specs и `src/test` в `dist`).
- Подпапки:
  - [src](./src/README.md) – сървърът: `buildApp`, конфигурация, db, services, routes, plugins, OpenClaw клиентът, интеграциите.
  - [drizzle](./drizzle/README.md) – SQL миграциите (DDL и data миграции).
  - [scripts](./scripts/README.md) – smoke тестовете на AI контрактите срещу OpenClaw и генераторът на seed миграции.

## Invariants

- `vitest.config.ts` – `fileParallelism: false`: всички spec файлове делят една тестова база и се пускат един след друг.
- `vitest.config.ts` – fixtures с AI отговори (`@family/shared/fixtures`) са само за specs и не се импортират от приложението.
- `tsconfig.build.json` – `src/test` и `*.spec.ts` не влизат в `dist`.
- `drizzle.config.ts` – drizzle-kit се пуска от `apps/api` (`pnpm --filter api db:*`). Без `.env` `DATABASE_URL` трябва да идва от средата.

## Side Effects

- `drizzle.config.ts` – `process.loadEnvFile('../../.env')` (ако го има) зарежда env.
- Сървърът (`src/server.ts`) и скриптовете имат свои странични ефекти; виж [src](./src/README.md) и [scripts](./scripts/README.md).

## Verification

- Run: `pnpm --filter api test` (нужна е тестовата база: `docker compose -p family-test --profile test up -d postgres-test`)
- Също: `pnpm --filter api typecheck` и `pnpm --filter api lint`
