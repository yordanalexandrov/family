# api — HTTP клиент, SSE и общи заявки

## Overview
Слоят за достъп до api-то: `client.ts` е единственият HTTP клиент (`apiFetch` със Zod проверка на отговора, `ApiError`, заглавие `X-Acting-User`), `events.ts` държи SSE връзката към `/api/events`, която инвалидира кеша на React Query, а `queries.ts` дава ключовете и куките за потребители, `me`, дашборд, календар и синхронизация. Схемите идват от `packages/shared` (`@family/shared`).

## Interface
- `client.ts:apiFetch` — типизирана заявка към `/api<path>`; отговорът минава през подадената `Schema<T>`
- `client.ts:ApiError` — грешка със `status`, `code`, `body` и `isSessionExpired()`, `isUnknownActingUser()`, `isServerError()`
- `client.ts:refusalOf` — типизиран отказ (под-код от `refusalSchemas`) или `null`
- `client.ts:isConnectionError` — `true` при липса на отговор или 5xx
- `client.ts:JSON_HEADERS`, `client.ts:Schema` — общо `Content-Type` и минималният интерфейс `{ parse(input) }`
- `events.ts:useServerEvents` — кука, монтира се веднъж в корена; слуша `/api/events` и инвалидира кешове
- `queries.ts:queryKeys` — ключове `users`, `me(actingUserId)`, `dashboard`, `calendarEvents(from, to)`
- `queries.ts:fetchMe`, `queries.ts:useMe` — профилът на действащия потребител
- `queries.ts:useUsers` — хората от api-то с офлайн кеш
- `queries.ts:useDashboard`, `queries.ts:useCalendarEvents` — дашборд и събития за интервал `[from, to)`
- `queries.ts:useSync` — мутация за ръчна синхронизация на източник

## Invariants
- `client.ts:apiFetch` — винаги праща `Accept: application/json` и `redirect: 'manual'`; всички пътища са с префикс `BASE_PATH` = `/api`
- `client.ts:apiFetch` — `X-Acting-User` идва от `readWritingUserId()` само ако има стойност и заглавието не е подадено изрично
- `client.ts:isRedirect` — `opaqueredirect` или 3xx дава `ApiError` с код `session_expired` (изтекла Cloudflare Access сесия)
- `client.ts:apiFetch` — тяло на грешка извън `apiErrorSchema` дава код `http_error`; 2xx тяло извън схемата дава код `invalid_response`
- `client.ts:ApiError.isSessionExpired` — статус 401, 403 или код `session_expired`; `isServerError` — статус >= 500
- `events.ts:useServerEvents` — без `EventSource` не прави нищо; `invalidateAll` само при повторно свързване и при връщане на видим екран
- `events.ts:invalidate` — `menu.changed` инвалидира `menuKeys.plan(weekStart)` и `queryKeys.dashboard`; `menu.proposal.changed` инвалидира `menuKeys.weekProposal(weekStart)` и вика `noteProposalChange`; другите събития със `weekStart` инвалидират `shoppingKeys.list(weekStart)`, а без него `shoppingKeys.all` и `pantryKeys.all`
- `events.ts:onSignal` — съобщение, което не минава `serverEventSchema`, се пренебрегва с `logger.warn`
- `queries.ts:fetchUsers` — при успех пише в офлайн кеша; кешът се чете само при `isConnectionError(error)`; `useUsers` е с `networkMode: 'always'`
- `queries.ts:useMe` — `enabled` само при `actingUserId !== null`
- `queries.ts:useDashboard`, `queries.ts:useCalendarEvents` — `refetchInterval` 60 000 ms, `staleTime` 30 000 ms

## Side Effects
- `client.ts:apiFetch` — глобален `fetch` (единственото разрешено място според `biome.json`)
- `queries.ts:fetchMe` — GET `/api/me`
- `queries.ts:fetchUsers` — GET `/api/users`; localStorage ключ `family.users` през `offlineCache`
- `queries.ts:useDashboard` — GET `/api/dashboard` на всеки 60 s
- `queries.ts:useCalendarEvents` — GET `/api/calendar/events?from=&to=` на всеки 60 s
- `queries.ts:useSync` — POST `/api/sync/${source}`; при успех инвалидира `queryKeys.dashboard`, а за `calendar` и `['calendar-events']`
- `events.ts:useServerEvents` — `EventSource` към `/api/events` и слушател за `visibilitychange` на `document`
- `events.ts:invalidate`, `events.ts:invalidateAll` — `invalidateQueries` върху `menuKeys`, `shoppingKeys`, `pantryKeys` и `queryKeys.dashboard`

## Verification
- Run: `pnpm --filter web test src/api`
