# shopping — списъкът за пазаруване

## Overview
Екранът „Пазаруване“ (`/shopping`): списъкът за тази или следващата седмица, групиран по щандове. Работи и офлайн: `offline.ts` пази последния списък и опашка от отметки в IndexedDB, `queries.ts` изпраща опашката преди всяко четене, а `sync.ts` и `SyncIcon.tsx` показват какво още не е изпратено.

## Interface
- `ShoppingWeek.tsx:ShoppingWeek` — екранът с табове, щандове, „Купени“, „Скрити“, „Скрити от килера“ и лентата „Менюто още не е съгласувано“ (`NotAgreed`, брои `mealsToAgree`)
- `AddItemSheet.tsx:AddItemSheet`, `SourcesSheet.tsx:SourcesSheet`, `SyncIcon.tsx:SyncIcon` — ръчен ред, меню на реда, иконата за синхронизация
- `queries.ts:shoppingKeys`, `useShoppingWeek`, `ShoppingWeekData` — списъкът на седмицата (`staleSince` за кеширан)
- `queries.ts:useToggleCheck`, `useSetHidden`, `useAddManualItem`, `useDeleteManualItem`, `useSetMealListed`, `OfflineError` — мутации
- `offline.ts:writeCachedList`, `readCachedList`, `enqueueCheck`, `queuedChecks`, `onQueueChange`, `applyQueuedChecks`, `flushQueuedChecks`, `QueuedCheck`, `CachedList` — офлайн кеш и опашка
- `sync.ts:useCheckSync`, `sync.ts:CheckSync`, `sync.ts:UNSENT_AFTER_MS` — `{pending, online, sendNow}`

## Invariants
- `offline.ts:flushing` — опашката се изпраща серийно и по ред; след `retry_later` по-късните отметки на същия ред чакат
- `offline.ts:sendOne` — мрежова грешка или изтекла сесия спират; 404 маха записа; друга грешка го оставя за после
- `offline.ts:readCachedList` — кешът важи само ако минава `shoppingListSchema` и има валиден `fetchedAt`
- `queries.ts:fetchShoppingWeek` — първо изпраща опашката, после чете; при `isConnectionError` ползва кеша; чакащите отметки се прилагат и в двата случая
- `queries.ts:useToggleCheck` — отметката първо се записва в опашката, после оптимистично в кеша
- `queries.ts:requireOnline` — скриване, ръчен ред, изтриване и ястие в списъка хвърлят `OfflineError` без връзка
- `queries.ts:useListChange` — тези мутации след успех инвалидират списъка; `useSetMealListed` първо записва върнатия цял списък в кеша (`staleSince: null`)
- `queries.ts:useShoppingWeek` — опреснява на 15 s (`REFRESH_INTERVAL_MS`) и при фокус
- `sync.ts:useCheckSync` — онлайн брои само отметки, чакали поне `UNSENT_AFTER_MS` = 800 ms
- `ShoppingWeek.tsx:isForeignCheck` — отметка на друг човек се маха само след потвърждение
- `ShoppingWeek.tsx:useHeldRows` — отметнатите редове стоят на място, докато минат 1500 ms (`SETTLE_MS`) без докосване
- `ShoppingWeek.tsx:ListView` — „Върни“ след „Скрий“ праща пак PUT `hidden: false`, а след изтриване на ръчен ред — нов POST (`manualItemOf`); „Свърши“ в „Скрити от килера“ е изключено без връзка
- `ShoppingWeek.tsx:useAddedRow` — току-що добавеният ръчен ред се превърта до видимото и е оцветен `ADDED_MS` = 2000 ms
- `SourcesSheet.tsx:SourcesSheet` — „Имаме го винаги“ само за изчислен ред с `ingredientId`, чийто продукт не е `staple`; `AddItemSheet.tsx:UNITS` — без `pinch`

## Side Effects
- `queries.ts:fetchShoppingWeek` — GET `/api/shopping-lists/:weekStart`
- `queries.ts:sendCheck` — PUT `/api/shopping-lists/:weekStart/items/:key/checked` със `X-Acting-User` на човека от опашката
- `queries.ts:useSetHidden`, `useAddManualItem`, `useDeleteManualItem`, `useSetMealListed` — PUT `.../items/:key/hidden`, POST `.../items`, DELETE `.../items/:key`, PUT/DELETE `.../meals/:mealId`
- `offline.ts` — IndexedDB (idb-keyval) ключове `family.shopping.list.<weekStart>` и `family.shopping.queue`
- `ShoppingWeek.tsx:useRefreshWhenOnline` — при `online` инвалидира `shoppingKeys.all` и `queryKeys.users`
- `ShoppingWeek.tsx:ListView` — `useMarkRanOut`, `useMakeStaple` от `features/pantry`
- `ShoppingWeek.tsx:NotAgreed` — `usePlan` от `features/menu` (GET `/api/menu/plans?weekStart=`) и `useUsers`

## Verification
- Run: `pnpm --filter web test src/features/shopping`
