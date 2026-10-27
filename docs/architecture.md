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
plugins/     → некапсулирани (fastify-plugin) hooks за всички routes: Cloudflare Access → `request.user`, действащ потребител → `request.actor`, error handler; `scheduler` — кронът на api
services/    → бизнес логика (меню → списък за пазаруване, синхронизация на календара и т.н.); без HTTP детайли
integrations/→ клиенти на външни системи (`google-calendar/`): само HTTP и auth към тях, без база
openclaw/    → клиентът към OpenClaw gateway-а (`/v1/chat/completions`): `complete(contract, input, { agent })` с един `AiContract` от shared, проверка на входа, Zod валидация на изхода + един retry
db/          → Drizzle schema, миграции, repository функции
scripts/     → ръчни инструменти през `tsx` (напр. `calendar:probe` срещу реалния Google)
```

Синхронизациите с външни системи вървят сами: `plugins/scheduler.ts` пуска всяка задача 5 с след `ready`, после през интервала ± 25 % jitter (`setTimeout` верига) и я спира при затваряне, като изчаква текущото пускане. Задача се регистрира само ако системата е конфигурирана; иначе се логва „calendar sync: unconfigured“ и `app.calendarSync` е `null`. Задачата `menu-propose` (на ~15 мин и при старт, затова наваксва след рестарт) пита `scheduledProposalDue` в `services/menu-schedule.ts` и от сряда 09:00 `Europe/Sofia` пуска `menu.propose` за следващата седмица без подсказка, с `trigger: 'schedule'` и без потребител (`requested_by` и `meal_plan.created_by` са `null`), ако седмицата няма меню, `pending` заявка или заявка от крона; неуспехът не се повтаря от крона. Без OpenClaw `app.menuSchedule` е `null` и задачата не се регистрира. Ръчното пускане (`POST /api/sync/calendar`) и кронът минават през един и същ service с mutex, затова второ пускане по време на първото връща `running`. `buildApp()` получава клиента (`googleCalendar`), календарите от GOOGLE_CALENDARS (`calendarSources`, upsert-ват се в `onReady`), часовника (`now`) и `scheduler` отвън: `server.ts` ги строи от config, а spec-овете подават клиент с генериран ключ срещу msw, фиксиран часовник и без scheduler.

AI контрактите вървят във фон в процеса на api като AI заявки (GLOSSARY): `POST` записва заявка `pending` и връща `202`, фоновото пускане вика OpenClaw клиента и записва `done`/`failed`, клиентът пита с `GET`. Жизненият цикъл е един модул, `services/contract-requests.ts`: `createContractRequests({ db, client, log })` се създава веднъж в `buildApp()`, а `register(contract, store, agent)` дава на всеки контракт handle `{ request, get }`, който service-ът му ползва (`app.recipeSuggestions`, `app.menu`) или route-ът ползва направо (`app.mealReplacements`). Модулът отказва с 503 без клиент, записва `pending` в транзакция, пуска заявката след отговора, вика `client.complete(contract, input, …)` и при успех записва резултата и `done` в една транзакция, а при неуспех — `failed` с кода. Специфичното за контракта е в store адаптера до service-а (`suggestionRequestStore`, `createMenuProposalStore(events, now)`, `createMealReplaceStore(now)`): таблицата, `insert` с отказите на контракта (напр. 409 `not_enough_recipes` и заета седмица за менюто), `buildInput`, `onDone`, по избор `afterDone` (след commit-а, напр. сигнал по шината) и по избор `noResults` (валиден отговор без нищо за записване: заявката става `failed`/`no_results`, а причината се логва). Таблиците на заявките са отделни, но споделят колоните от `contractRequestColumns()` (`db/schema/columns.ts`), затова `db/repositories/contract-requests.ts` ги приключва и маха остарелите общо. `app.close()` прекъсва и изчаква текущите заявки, а при старт `failStale()` прави `pending` заявките на всички контракти, по-стари от 10 мин, `failed`/`stale`. Статусите са `contractRequestStatusSchema`, а кодовете на `failed` (`error`: `timeout`, `invalid_output`, `no_results`, `http_<status>`, `aborted`, `stale`, `error`) са `contractFailureSchema` в shared; api ги записва, web ги превежда на съобщения. Без `OPENCLAW_GATEWAY_PASSWORD` клиентът е изключен и всяка AI заявка (`recipe.suggest`, `menu.propose` или `meal.replace`) връща `503 openclaw_unavailable` — позволено само в `AUTH_MODE=dev`; във всеки друг режим api не тръгва.

Свежестта между устройствата е SSE `GET /api/events` (`routes/events.ts`): носи само сигнали `menu.changed { weekStart }` и `shopping.changed { weekStart? }` (без `weekStart` — всеки списък, напр. промяна в килера) (`serverEventSchema` в `packages/shared/src/events.ts`), а данните клиентът чете през REST. Шината е в паметта (`services/events.ts`, `app.events`: `publish`, `subscribe → unsubscribe`), защото api е единственият процес и единственият писач. Service публикува **след** успешен commit, никога в транзакцията и никога при отказ; промяна на ястие (съдържание, размяна, готвач, порции) или на плана пуска и двата сигнала за седмицата, а глас и ред в разговора — само `menu.changed`, защото списъкът не зависи от тях. Route-ът е без действащ потребител (`EventSource` не праща заглавки), пише `: ping` на 25 s заради Cloudflare и затваря потоците в `preClose`, за да не чака `app.close()`. Caddy не компресира `/api/events`, а service worker-ът не го прихваща.

Route-ът и hook-ът в `plugins/` не пипат базата директно, а викат service; service-ът не знае за request/reply. Service с памет (кеш) се създава веднъж в `buildApp()` и се ползва като `app.<име>` (напр. `app.users`).

Hooks-овете от `plugins/` важат за `/api/*`: Access в `onRequest` (`AUTH_MODE=cloudflare|dev`), действащият потребител от `X-Acting-User` в `preHandler`. Route, който трябва да работи преди да е избран потребител, се изключва с `config: { actingUser: false }`, не със списък от пътища. Грешките са `{ error, message }` (`apiErrorSchema` в shared): `error` е английски код от `apiErrorCodeSchema` (нов код се добавя там), `message` е на български, защото стига до екрана; за отказ хвърли `HttpError` от `plugins/error-handler.ts`. Service не знае за HTTP и отказва с типизирана грешка от `services/errors.ts` (наследник на `ServiceRefusal`: `NotFoundError` → 404 `not_found`, `ConflictError` → 409 `conflict` с `details` в тялото, `InvalidReferenceError` → 400 `invalid_reference`, `InvalidActionError` → 400 `invalid_action`, `ForbiddenError` → 403 `forbidden`, `OpenClawUnavailableError` → 503 `openclaw_unavailable`); error handler-ът я мапва на статус по таблица `REFUSALS`, а нов клас се добавя и там.

## Слоеве в `apps/web`

```
app/              → композиция: code-based маршрути (TanStack Router), QueryClient, режим на устройството, действащ потребител (localStorage), тема, ниво на ефектите, долна навигация
features/<име>/   → екран + hooks + компоненти за една функционалност (device, who, dashboard, calendar, settings; после menu, shopping, recipes, pantry)
api/              → един HTTP клиент (`client.ts`: `/api`, `X-Acting-User` само в режим `phone`, Zod, `ApiError`, пренасочване от Access = изтекла сесия) + TanStack Query hooks (`queries.ts`) + `useServerEvents()` (`events.ts`, монтиран веднъж в `App`): `EventSource('/api/events')` инвалидира ключа на сигнала, а след повторна връзка и при връщане към приложението — всичко под `menu` и `shopping`
components/       → споделени UI компоненти без бизнес логика (Card, Aurora, TopBar, Avatar, Spinner, ErrorBox, Toast, Sheet, Field)
lib/              → общи помощници за няколко features: форматиране на час, дата, пари и порции (`format.ts`), надписите за остарели или липсващи данни (`sync-notes.ts`), polling и съобщенията за неуспех на AI заявките (`ai-requests.ts`), текущият момент (`use-now.ts`)
styles/           → design tokens на „Стъкло“ (`tokens.css`, `data-theme`, `data-effects`), шрифтът Inter (`fonts.css`) и глобални стилове
logger.ts         → единственият изход към конзолата
```

Компонентите не викат `fetch` директно, а hooks от `features/*` или `api/`. Root layout-ът записва `?device=phone|kiosk|tv` в `family.deviceMode` и маха параметъра; без режим праща към `/device` („Какво е това устройство?“), а в режим `phone` без действащ потребител — към `/who`. kiosk и TV нямат действащ потребител. Заявка, върнала `400 unknown_acting_user` (потребителят вече го няма), чисти избора централно в `QueryCache` (`app/query-client.ts`), така че и тогава root layout-ът води към `/who`; екраните не го обработват сами.

Офлайн данните са два вида: дашбордът пази последния си отговор в `localStorage` (`features/dashboard/cache.ts`), а списъкът за пазаруване — последния отговор на седмица и опашката от отметки без връзка в IndexedDB през `idb-keyval` (`features/shopping/offline.ts`). Опашката се изпраща по реда си преди всяко четене на списъка (отваряне, на 15 s, при `online` и `visibilitychange`); всяка отметка носи действащия потребител, който я е направил, и се праща от негово име; 404 (редът го няма) се маха, друг 4xx остава за следващото изпращане, а мрежова грешка, 5xx или изтекла сесия спират изпращането до следващия път. Service worker-ът (`vite-plugin-pwa`, `navigateFallback`) сервира shell-а на всеки маршрут офлайн; `/api/*` не се кешира от него.

## Вижте също

- [Конвенции](conventions.md)
- [Тестване](testing.md)
