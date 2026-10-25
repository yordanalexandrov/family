# Структура на репото и граници между пакетите

Как е подреден monorepo-то и правилата за пресичане на границите. Прочети това, преди да пипаш повече от един пакет. Общата архитектура (компоненти, роли, AI контракти) е в [concept.md](concept.md#архитектура).

## Карта на пакетите

| Пакет | Технология | Роля |
|---|---|---|
| `apps/web` | React + Vite, PWA (vite-plugin-pwa) | Единствен клиент за телефон, таблет и TV; kiosk изглед за таблета |
| `apps/api` | Fastify + TypeScript + Drizzle | REST/JSON API, auth, бизнес логика, единственият писач в Postgres |
| `packages/shared` | Framework-agnostic TypeScript | Типове, Zod schemas за API и AI контрактите, чисти помощни функции |

## Инфраструктура

Продукцията е един Compose проект на `homesrv`: `docker compose -p family up -d --build` от корена на репото с `.env` до него (на сървъра го пише `deploy.yml`). Образите идват от `Dockerfile` в корена: target `api` (`node:24-alpine`, само production зависимостите, `USER node`) и target `web` (`caddy:2-alpine` със статиката от `apps/web/dist`).

| Service | Мрежа | Порт | Роля |
|---|---|---|---|
| `caddy` | host | `127.0.0.1:18090` | статиката на PWA-то; `/api/*` и `/healthz` → api. cloudflared сочи тук |
| `api` | host | `127.0.0.1:18091` | прилага миграциите при старт, после приема заявки |
| `postgres` | bridge | `127.0.0.1:5432` | данните, във volume `pgdata` (оцелява `down`/`up`) |
| `backup` | bridge | — | `pg_dump` всяка нощ в 03:00 (`TZ`) в `/srv/family/backups`, пази 14 дни |
| `postgres-test` | bridge, профил `test` | `127.0.0.1:5433` | тестовата база за `pnpm test`, tmpfs |

`api` и `caddy` вървят на host мрежата на Docker и слушат само на loopback ([ADR-0005](adr/0005-api-and-caddy-on-host-network.md)): от LAN не се вижда нищо, cloudflared стига Caddy по loopback, а api може да вика OpenClaw на `127.0.0.1:18789`. Помежду си говорят по фиксираните портове, не по имена от compose мрежата. TLS терминира Cloudflare. OpenClaw е външен и говори само с api; n8n отсъства във Фаза 1 ([ADR-0001](adr/0001-no-n8n-in-phase-1.md)).

`infra/` държи конфигурацията извън пакетите: `caddy/Caddyfile` (влиза в образа `web`), `backup/backup.sh` (монтира се read-only в `backup`) и [README.md](../infra/README.md): портове, пълният стек локално, ръчен backup и възстановяване.

## Правила за границите

- Споделена логика между web и api живее в `packages/shared`, не се дублира локално.
- `packages/shared` не зависи от React, Fastify или Drizzle. Ако нещо иска такава зависимост — не е за там.
- `apps/web` не внася нищо от `apps/api` и обратно. Общият език е `@family/shared` и HTTP.
- Schema на базата (Drizzle) е само в `apps/api`. Клиентът вижда API модели от `shared`, не DB редове.
- Търси символа в целия workspace, преди да добавиш нова абстракция.

## Правило за импорт на shared

Всичко от споделения пакет се внася през alias-а, никога по относителен път през границата:

```typescript
import { mealPlanSchema, type MealPlan } from '@family/shared';
```

В dev и тестове (`tsx`, Vitest, Vite) alias-ът сочи към `packages/shared/src` (tsconfig `paths` / Vite `resolve.alias`), затова shared не се build-ва предварително. Production build-овете (`tsc -b` в api, `node dist/server.js`) го резолвват през `exports` на пакета към `packages/shared/dist`, който `pnpm build` произвежда първи.

## Слоеве в `apps/api`

```
routes/      → Fastify plugins; валидират вход/изход със schema от shared, викат service
plugins/     → некапсулирани (fastify-plugin) hooks за всички routes: Cloudflare Access → `request.user`, действащ потребител → `request.actor`, error handler
services/    → бизнес логика (меню → списък за пазаруване и т.н.); без HTTP детайли
db/          → Drizzle schema, миграции, repository функции
```

Route-ът и hook-ът в `plugins/` не пипат базата директно, а викат service; service-ът не знае за request/reply. Service с памет (кеш) се създава веднъж в `buildApp()` и се ползва като `app.<име>` (напр. `app.users`).

Hooks-овете от `plugins/` важат за `/api/*`: Access в `onRequest` (`AUTH_MODE=cloudflare|dev`), действащият потребител от `X-Acting-User` в `preHandler`. Route, който трябва да работи преди да е избран потребител, се изключва с `config: { actingUser: false }`, не със списък от пътища. Грешките са `{ error, message }` (`apiErrorSchema` в shared): `error` е английски код от `apiErrorCodeSchema` (нов код се добавя там), `message` е на български, защото стига до екрана; за отказ хвърли `HttpError` от `plugins/error-handler.ts`.

## Слоеве в `apps/web`

```
app/              → композиция: code-based маршрути (TanStack Router), QueryClient, действащ потребител (localStorage), тема
features/<име>/   → екран + hooks + компоненти за една функционалност (who, home; после dashboard, menu, shopping, recipes)
api/              → един HTTP клиент (`client.ts`: `/api`, `X-Acting-User`, Zod, `ApiError`) + TanStack Query hooks (`queries.ts`)
components/       → споделени UI компоненти без бизнес логика (Avatar, Spinner, ErrorBox)
styles/           → design tokens (`tokens.css`, `data-theme`) и глобални стилове
logger.ts         → единственият изход към конзолата
```

Компонентите не викат `fetch` директно, а hooks от `features/*` или `api/`. Root layout-ът праща към `/who`, докато устройството няма действащ потребител. Заявка, върнала `400 unknown_acting_user` (потребителят вече го няма), чисти избора централно в `QueryCache` (`app/query-client.ts`), така че и тогава root layout-ът води към `/who`; екраните не го обработват сами.

## Вижте също

- [Конвенции](conventions.md)
- [Тестване](testing.md)
