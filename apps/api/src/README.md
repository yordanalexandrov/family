# src

## Overview

Изходният код на API-то: Fastify сървър, който е единственият процес и единственият писач в Postgres. `server.ts` зарежда конфигурацията, създава външните клиенти, прилага миграциите и слуша. `app.ts:buildApp` сглобява инстанцията (плъгини, услуги като декорации, routes), без да слуша, за да могат тестовете да я ползват с `app.inject()`. `config.ts` валидира средата със zod. `src/test` държи помощните функции и fixtures на specs (`buildTestApp`, `setup.ts`, mocks) и нарочно не е документирана.

## Interface

- `app.ts:buildApp, BuildAppOptions` – Fastify инстанцията. Притежава пула към базата (`app.db`) и го затваря при `app.close()`.
- `app.ts` (`declare module 'fastify'`) – декорациите на `app`: `db`, `users`, `now`, `events`, `push`, `reminders`, `menu`, `menuSchedule`, `mealReplacements`, `menuReworks`, `recipeSuggestions`, `recipeImports`, `recipeRefinements`, `recipeRevisions`, `cookingQuestions`, `calendarSync`, `budgetSync`.
- `config.ts:loadConfig, Config` – парсва `process.env` и хвърля четима грешка, която изрежда всяка невалидна променлива.
- `config.ts:loadOpenClawConfig, OpenClawConfig` – само променливите `OPENCLAW_*` (за smoke скриптовете).
- `config.ts:AuthConfig, VapidConfig, CalendarSourceConfig` – типовете на auth режима, VAPID ключовете и елемент от `GOOGLE_CALENDARS`.
- Променливи на средата (имена): `NODE_ENV`, `API_HOST` (по подразбиране `127.0.0.1`), `API_PORT` (по подразбиране `18091`), `LOG_LEVEL`, `DATABASE_URL` (задължителна), `AUTH_MODE` (`cloudflare` или `dev`), `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `ALLOWED_EMAILS`, `DEV_USER_EMAIL`, `OPENCLAW_URL`, `OPENCLAW_GATEWAY_PASSWORD`, `OPENCLAW_*_AGENT` (recipe, menu, meal, import, refine, cook, revise), `OPENCLAW_TIMEOUT_MS` (по подразбиране 180000), `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_CALENDARS`, `WALLET_API_TOKEN`, `WALLET_BUDGET_ID`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
- `logger.ts:loggerOptions` – pino опции: JSON към stdout, pretty само при `NODE_ENV=development`.
- `server.ts` – входната точка (`pnpm --filter api dev` / `start`).
- Подпапки:
  - [db](./db/README.md) – връзка с Postgres, миграции, схема, repositories и seed.
  - [services](./services/README.md) – бизнес логиката, AI заявките, синхронизациите, напомнянията и push.
  - [routes](./routes/README.md) – HTTP routes `/api/*` и `/healthz`.
  - [plugins](./plugins/README.md) – обработка на грешки, Cloudflare Access, Действащ потребител, cron.
  - [openclaw](./openclaw/README.md) – клиентът към OpenClaw gateway за AI контрактите.
  - [integrations](./integrations/README.md) – Google Calendar, Wallet, Web Push.
  - [scripts](./scripts/README.md) – `calendar:probe` и `vapid-keys`.
  - [types](./types/README.md) – декларации за `heic-decode`.

## Invariants

- `config.ts` (`devEnv`) – `AUTH_MODE=dev` се отказва при `NODE_ENV=production`.
- `config.ts` (`envSchema`) и `app.ts:buildApp` – без `OPENCLAW_GATEWAY_PASSWORD` се стартира само при `AUTH_MODE=dev`; `buildApp` го проверява отново и хвърля.
- `config.ts` (`envSchema`) – трите `VAPID_*` се задават заедно или никоя. Една или две от тях са грешка, а не „изключено“.
- `config.ts` – Google Calendar е включен само с `GOOGLE_SERVICE_ACCOUNT_JSON` и `GOOGLE_CALENDARS`, а Wallet само с `WALLET_API_TOKEN` и `WALLET_BUDGET_ID`. Иначе синхронизацията им е „unconfigured“. Празна стойност се брои за липсваща (`optional`).
- `config.ts` (`cloudflareEnv`) – `CF_ACCESS_TEAM_DOMAIN` е `https` URL без завършваща `/` (това е и `iss` на token-а). `ALLOWED_EMAILS` е списък, разделен със запетаи, с поне един адрес, и се свежда до lowercase.
- `config.ts:COOKING_ASK_TIMEOUT_MS` – `cooking.ask` има свой, по-кратък лимит (`cookTimeoutMs` = минимумът от него и `OPENCLAW_TIMEOUT_MS`).
- `server.ts` – миграциите се прилагат преди първата заявка. Неуспех при тях или при `listen` е фатален (`process.exit(1)`).
- `server.ts` – на `SIGTERM`/`SIGINT` вика `app.close()`, за да довърши текущите заявки и да затвори пула (node е PID 1 в контейнера).
- `app.ts:buildApp` – редът на регистрация е `errorHandler`, `cloudflareAccess`, `actingUser`, `scheduler` (ако има опции), после routes. При `onReady` се пускат `upsertCalendarSources` и `contractRequests.failStale()`. При `onClose` се вика `contractRequests.close()`, после `closeDb`.

## Side Effects

- `server.ts` – чете env, прилага миграции в базата, слуша TCP на `API_HOST:API_PORT`, закача signal handlers, вика `process.exit`.
- `app.ts:buildApp` – отваря пул към `DATABASE_URL`. При `onReady` пише `calendar_source` и маркира остарелите AI заявки.
- `logger.ts:loggerOptions` – логове в stdout.

## Verification

- Run: `pnpm --filter api test` (нужна е тестовата база: `docker compose -p family-test --profile test up -d postgres-test`)
