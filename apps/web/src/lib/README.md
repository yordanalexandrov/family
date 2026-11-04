# lib — помощни функции и куки

## Overview
Помощници без собствен UI: форматиране на дати, суми и количества за `bg-BG` в часовата зона на София, офлайн кеш в localStorage с куката `useOfflineCachedQuery`, запис на напредъка в Готвене за деня, съобщения за неуспешни AI заявки и малки куки за време, мрежа, медийни заявки и blob адреси.

## Interface
- `ai-requests.ts:POLL_INTERVAL_MS` — 3000 ms между проверките на `pending` AI заявка
- `ai-requests.ts:AiRequestKind`, `ai-requests.ts:FailedAiRequest`, `ai-requests.ts:failureMessage`, `ai-requests.ts:requestErrorFor` — видове AI заявки и съобщения за неуспех на български; `FailedAiRequest` носи `error`, `createdAt`, `finishedAt`
- `cooking-record.ts:COOKING_PROGRESS_KEY`, `readCookingRecord`, `updateCookingRecord`, `lastCookingApplied` — днешният запис на Готвене по рецепта
- `error-message.ts:errorMessage` — текст за toast от грешка
- `format.ts:formatTime`, `formatDayLong`, `formatWeekday`, `formatDate`, `formatShortRange`, `formatShortDate`, `formatMoney`, `formatServings`, `formatNumber`, `formatAmounts`, `formatQuantity`, `capitalize` — форматиране за `bg-BG`
- `offline-cache.ts:offlineCache` — кеш `write`/`read` в localStorage със Zod проверка
- `sync-notes.ts:syncNotes`, `sync-notes.ts:SYSTEM_NAMES` — надписите `unconfigured`/`stale` на карта
- `use-offline-cached-query.ts:useOfflineCachedQuery`, `OfflineCachedData` — обвива резултат на React Query с офлайн кеша (`pending`/`error`/`ok`/`offline`); третият параметър `usable` филтрира записаното (`null` — нищо за показване)
- `use-online.ts:useOnline`, `use-online.ts:NEEDS_CONNECTION` — има ли връзка и надписът „Иска връзка“
- `use-now.ts:useNow`, `use-media-query.ts:useMediaQuery`, `use-object-url.ts:useObjectUrl`, `use-hash-target.ts:useKeepHashTargetInView` — време, медийна заявка, object URL, котва от адреса

## Invariants
- `cooking-record.ts:readStored` — записът важи само за днешния ден по `dateKeyInSofia`; друг ден или повредени данни дават празен запис
- `cooking-record.ts:lastCookingApplied` — валидира с `lastCookingAppliedSchema`, иначе `[]`
- `offline-cache.ts:offlineCache.read` — `null` без запис, при неуспешна схема или невалиден `fetchedAt`; грешките само се логват
- `use-offline-cached-query.ts:useOfflineCachedQuery` — офлайн е `!online || (isError && isConnectionError(error))`; кешът се пише само при `data`; при офлайн слуша `online` и прави `refetch`; без мрежа и без годен кеш дава `status: 'error'` с `NO_CONNECTION`, не вечно `pending`
- `ai-requests.ts:reason` — при `timeout` с `finishedAt` текстът е „AI не отговори за N минути“ (под минута — секунди) по `createdAt`→`finishedAt`, без `finishedAt` — „AI не отговори навреме“
- `ai-requests.ts:requestErrorFor` — само `ApiError` с код `openclaw_unavailable` се заменя с „AI не е на разположение в момента“
- `format.ts:formatMoney` — без дробна част, освен за ненулева сума под 0.5
- `format.ts` — всички `Intl.DateTimeFormat` са с `FAMILY_TIME_ZONE` и `bg-BG`; `formatTime` е 24-часово
- `format.ts:formatQuantity` — `pinch` дава само думата за щипка; `quantity === null` дава празен низ
- `sync-notes.ts:staleNote` — жълт надпис само при `stale` или `failed`
- `use-hash-target.ts:useKeepHashTargetInView` — държи котвата най-много 2000 ms (`HOLD_MS`) и спира при действие на човека
- `use-object-url.ts:useObjectUrl` — всеки URL се освобождава при смяна или размонтиране

## Side Effects
- `cooking-record.ts:updateCookingRecord`, `cooking-record.ts:readStored` — localStorage ключ `family.cooking.progress`; `logger.warn` при грешка
- `offline-cache.ts:offlineCache` — localStorage под подадения ключ
- `use-offline-cached-query.ts:useOfflineCachedQuery` — пише кеша при успех; слушател `online` на `window`
- `use-hash-target.ts:useKeepHashTargetInView` — `window.scrollTo`, `ResizeObserver`, `setTimeout`, слушатели `wheel`/`touchstart`/`pointerdown`/`keydown`
- `use-media-query.ts:useMediaQuery` — `matchMedia` със слушател `change`
- `use-now.ts:useNow` — `setInterval`
- `use-object-url.ts:useObjectUrl` — `URL.createObjectURL`/`URL.revokeObjectURL`
- `use-online.ts:useOnline` — `navigator.onLine` и слушатели `online`/`offline`

## Verification
- Run: `pnpm --filter web test src/lib`
