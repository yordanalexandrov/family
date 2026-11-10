# routes

## Overview

HTTP повърхността на API-то: по един Fastify плъгин (`FastifyPluginAsyncZod`) на област, регистриран в `src/app.ts:buildApp`. Routes са тънки: валидират входа и изхода със zod схемите от `packages/shared` и викат `src/services` (или декорациите на `app`, напр. `app.menu`, `app.recipeImports`). Отказите идват като `ServiceRefusal`/`HttpError` и се превръщат в отговор от `src/plugins/error-handler.ts`.

## Interface

- `health.ts:healthRoutes` – `GET /healthz` (извън `/api`: 200 при `ok`, 503 при `degraded`).
- `users.ts:usersRoutes` – `GET /api/users` (само хората, без служебния Рецептурко, ADR-0014). `me.ts:meRoutes` – `GET /api/me`.
- `sync.ts:syncRoutes` – `POST /api/sync/calendar`, `POST /api/sync/budget` („Обнови сега“; 202 докато тече, `unconfigured` без конфигурация).
- `calendar-events.ts:calendarEventsRoutes` – `GET /api/calendar/events?from&to` (по подразбиране от днес в София до `from + CALENDAR_MAX_DAYS`). `dashboard.ts:dashboardRoutes` – `GET /api/dashboard`.
- `events.ts:eventsRoutes` – `GET /api/events` (Server-Sent Events със сигнали за промяна).
- `ingredients.ts:ingredientsRoutes` – `GET /api/ingredients`, `POST /api/ingredients`, `PATCH /api/ingredients/:id`.
- `recipes.ts:recipesRoutes` – `GET /api/recipes`, `GET /api/recipes/:id`, `POST /api/recipes`, `PUT /api/recipes/:id`, `POST /api/recipes/:id/archive`, `POST /api/recipes/:id/unarchive`, `PUT /api/recipes/:id/rating`, `DELETE /api/recipes/:id/rating`.
- `recipe-suggestions.ts:recipeSuggestionsRoutes` – `POST|GET /api/recipe-suggestions/requests`, `GET /api/recipe-suggestions/requests/:id`, `POST /api/recipe-suggestions/:id/approve|reject|restore`.
- `recipe-imports.ts:recipeImportsRoutes` – `POST /api/recipe-imports` (JSON или multipart с 1–8 снимки в полето `photo`), `GET /api/recipe-imports`, `GET /api/recipe-imports/:id`.
- `recipe-refinements.ts:recipeRefinementsRoutes` – `POST /api/recipes/:id/refinements`, `GET /api/recipes/refinements/:id`.
- `recipe-revisions.ts:recipeRevisionsRoutes` – `POST /api/recipes/:id/revisions`, `POST /api/recipe-suggestions/:id/revisions`, `GET /api/recipes/revisions/:id`, `POST /api/recipes/revisions/:id/reject`.
- `cooking-questions.ts:cookingQuestionsRoutes` – `POST /api/recipes/:id/questions`, `GET /api/recipes/questions/:id`.
- `step-photos.ts:stepPhotosRoutes` – `POST /api/step-photos` (multipart), `GET /api/step-photos/:id` (JPEG, по избор `?w=` миниатюра).
- `menu.ts:menuRoutes` – `GET|POST /api/menu/plans`, `DELETE /api/menu/plans/:id`, `PATCH /api/menu/meals/:id`, `PUT|DELETE /api/menu/meals/:id/vote`, `POST /api/menu/meals/:id/restore|swap|thawed|cook-claim`, `GET|POST /api/menu/meals/:id/comments`, `DELETE /api/menu/comments/:id`, `POST|GET /api/menu/proposals`, `GET /api/menu/proposals/:id`.
- `meal-replacements.ts:mealReplacementsRoutes` – `POST|GET /api/menu/meals/:id/replacements`, `GET /api/menu/replacements/:id`.
- `menu-reworks.ts:menuReworksRoutes` – `POST /api/menu/reworks`, `GET /api/menu/reworks?weekStart=`, `GET /api/menu/reworks/:id` (двете четения без действащ потребител).
- `shopping.ts:shoppingRoutes` – `GET /api/shopping-lists/:weekStart`, `PUT /api/shopping-lists/:weekStart/items/:key/checked|hidden`, `POST /api/shopping-lists/:weekStart/items`, `DELETE /api/shopping-lists/:weekStart/items/:key`, `PUT|DELETE /api/shopping-lists/:weekStart/meals/:mealId`.
- `pantry.ts:pantryRoutes` – `GET|POST /api/pantry`, `PATCH|DELETE /api/pantry/:id`, `POST /api/pantry/:id/ran-out`.
- `appliances.ts:appliancesRoutes` – `GET|POST /api/appliances`, `PUT|DELETE /api/appliances/:id`.
- `notifications.ts:notificationsRoutes` – `GET /api/notifications/vapid-key`, `PUT|DELETE /api/notifications/subscription`, `GET|PUT /api/notifications/settings`, `POST /api/notifications/test` (`vapid-key` и `test` отговарят 404 `push_disabled`, когато сървърът няма VAPID ключове – `requirePublicKey`). Служебният Рецептурко (роля `app`) получава 403 `forbidden` на всички тях (ADR-0014).
- `inbox.ts:inboxRoutes` – `GET /api/inbox` (бутоните „Извадих“/„Аз“ или кой е отговорил; `inbox.changed` към засегнатите след отговор праща менюто, `app.menu` и преработката, чрез `inbox.answered`), `GET /api/inbox/unread-count`, `POST /api/inbox/read-all`, `POST /api/inbox/:id/read` (204; 404 за чужд или непознат запис), всички на действащия потребител (Входяща кутия, ADR-0015).
- `params.ts:idParamsSchema` – `{ id: uuid }` за `:id` параметрите.
- `photo-form.ts:PHOTO_FIELD, missingPhoto, megabytes, photoTooLarge` – общите помощни функции за multipart полето `photo` и грешките му.

## Invariants

- `src/app.ts:buildApp` задава `validatorCompiler`/`serializerCompiler` от `fastify-type-provider-zod`: схемите на routes валидират входа и проверяват изхода.
- `actingUser: false` (работи без избран потребител): `GET /api/users`, `/api/calendar/events`, `/api/dashboard`, `/api/events`, `GET /api/recipes`, `GET /api/recipes/:id`, `GET /api/recipes/questions/:id`, `GET /api/recipes/revisions/:id`, `GET /api/menu/plans`, `GET /api/menu/proposals[/:id]`, `GET /api/shopping-lists/:weekStart`, `GET /api/step-photos/:id`. Всички останали `/api/*` routes изискват `X-Acting-User` (`src/plugins/acting-user.ts`).
- `actingUser: 'optional'` (и kiosk без потребител): `recipes.ts` (`PUT|DELETE /api/recipes/:id/rating`), `cooking-questions.ts` (`POST /api/recipes/:id/questions`), `recipe-revisions.ts` (`POST` на поправки и `reject`).
- `health.ts:healthRoutes` – `/healthz` е извън Cloudflare Access (за deploy smoke и мониторинг).
- `events.ts:eventsRoutes` – SSE носи само сигнали (`menu.changed`, `menu.proposal.changed`, `shopping.changed`, …) без лични данни; клиентът презарежда през REST. `?user=<uuid>` (иначе 400) казва чии `inbox.changed` получава потокът; без него — никои (kiosk, TV). На всеки 25 s (`HEARTBEAT_MS`) праща `: ping`, защото Cloudflare затваря тиха връзка след ~100 s. При `preClose` отворените потоци се затварят.
- `recipe-imports.ts:readPhotos` – multipart лимити: `IMPORT_PHOTO_MAX_BYTES` на файл и `IMPORT_PHOTOS_MAX_BYTES` общо (413 `photo_too_large`), най-много `IMPORT_PHOTO_MAX_PARTS` (8) файла (иначе 400 `validation_error`). Файл, който по байтовете не е JPEG/PNG/WebP/HEIC, е 415 `unsupported_photo`. Снимките остават в паметта, не се пишат в базата или на диска. `step-photos.ts:stepPhotosRoutes` – `STEP_PHOTO_MAX_BYTES` и точно 1 файл.
- `calendar-events.ts:calendarEventsRoutes` – периодът `from`–`to` трябва да е от 1 до `CALENDAR_MAX_DAYS` (14) дни, иначе 400 `validation_error`.
- `step-photos.ts:stepPhotosRoutes` – `GET` връща `image/jpeg` с immutable `cache-control`.
- `recipes.ts:recipesRoutes` (коментар) – Оценката не е промяна на менюто, затова не праща `menu.changed`.
- POST на AI заявка (предложения, внасяне, подобряване, поправка, въпрос, предложение за меню, замяна) записва `pending` заявка и връща 202. Клиентът проверява състоянието ѝ през `GET` (`src/services/contract-requests.ts:createContractRequests`).

## Side Effects

- Пишат в базата и пращат сигнали само през `src/services` и декорациите на `app` (`app.menu`, `app.events`, `app.reminders`, `app.recipeSuggestions`, `app.recipeImports`, `app.recipeRefinements`, `app.recipeRevisions`, `app.cookingQuestions`, `app.mealReplacements`, `app.menuReworks`, `app.push`, `app.calendarSync`, `app.budgetSync`).
- `events.ts:eventsRoutes` – държи отворени HTTP връзки (`reply.hijack()`) и `setInterval` таймер на връзка.
- `notifications.ts:notificationsRoutes` – `POST /api/notifications/test` праща Web Push през `app.push.sendTest`.

## Verification

- Run: `pnpm --filter api test src/routes` (нужна е тестовата база: `docker compose -p family-test --profile test up -d postgres-test`)
