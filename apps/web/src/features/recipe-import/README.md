# recipe-import — „Внеси рецепта“

## Overview
Внасяне на рецепта от текст, линк или снимка: екран с три таба, изглед на заявка (изчакване, преглед, грешка) и последните внасяния. Снимките се смаляват в браузъра; споделяне от Android минава през service worker-а (`share-target`) и Cache API. Прегледът и одобрението ползват `features/suggestions` (`ReviewSuggestion`).

## Interface
- `ImportScreen.tsx:ImportScreen`, `ImportScreen.tsx:parseImportSearch` — `/recipes/import` с табове Текст/Линк/Снимка; `?rejected=` дава `DecisionToast` „Отхвърлено · Върни“
- `ImportRequestView.tsx:ImportRequestView` — `/recipes/import/$requestId`; „Отхвърли“ води към `/recipes/import?rejected=`
- `ImportRequestView.tsx:ImportFailed`, `retryParams` — неуспешно внасяне: при `fetch_blocked`/`fetch_failed` „Постави текста“ (таб „Текст“ с линка), при снимка „Нова снимка“, при текст „Редактирай и опитай пак“; „Опитай пак“ за линк праща `force: true`, а за снимка `{ kind: 'photo', photos }` със записаните снимки (без ново качване)
- `ImportLinkForm.tsx:ImportLinkForm`, `ImportPhotoForm.tsx:ImportPhotoForm`, `ImportTextForm.tsx:ImportTextForm`, `RecentImports.tsx:RecentImports`, `ImportTextForm.tsx:ImportTextDraft` — табовете и списъкът; черновата на „Текст“ се пази в `ImportScreen` между табовете
- `queries.ts:importKeys`, `useRecentImports`, `useRequestImport`, `useImport`, `PhotoImport`, `ImportRequestParams` — заявки за внасяне
- `messages.ts:importLabel`, `importFailureMessage`, `textLead` — надписи
- `clipboard.ts:canReadClipboard`, `clipboard.ts:readClipboard` — клипборд
- `resize-photo.ts:resizePhoto`, `resize-photo.ts:resizeStepPhoto` — смаляване до JPEG (ползва се и от `features/step-photos`)
- `share-target.ts:importFromShare`, `SharedData` — споделени `title`/`text`/`url` към параметри за внасяне
- `shared-photo.ts:isShareTarget`, `receiveShare`, `takeSharedPhoto` — споделена снимка (за `sw.ts` и екрана)

## Invariants
- `ImportRequestView.tsx:ImportSubject` — под изчакването и грешката на внасяне от снимка са миниатюрите на записаните снимки (`detail.photos`), затова се виждат и след презареждане; `ImportSubject` пише „Снимки“ при повече от една; `queries.ts:useRequestImport` не попълва детайла на внасяне от нова снимка (`kind: 'upload'`; отговорът на POST е без id-тата им), а го чака от GET
- `queries.ts:useImport` — проверява на `POLL_INTERVAL_MS` само докато е `pending`; `RECENT_LIMIT` = 10
- `queries.ts:importBody` — новите снимки (`kind: 'upload'`) са `multipart/form-data` с поле `photo`; текст, линк и записаните снимки са JSON
- `ImportScreen.tsx:sharedStarted` — споделянето пуска една заявка (и при StrictMode) и подменя адреса с replace, за да не се внесе пак при презареждане
- `ImportLinkForm.tsx:submit` — само http(s) линк, който минава `URL.canParse`; 409 `already_imported` за същия линк скрива „Внеси“ и дава „Отвори“/„Внеси пак“ (`force: true`)
- `ImportPhotoForm.tsx:tooLargeMessage` — блокира над `IMPORT_PHOTO_MAX_BYTES` за част или `IMPORT_PHOTOS_MAX_BYTES` общо
- `shared-photo.ts:isShareTarget` — само POST от същия origin към `/recipes/import`; `takeSharedPhoto` изтрива снимката след четене
- `resize-photo.ts:resizePhoto` — ако картината не се декодира, се праща оригиналът

## Side Effects
- `queries.ts:useRecentImports` — GET `/api/recipe-imports?limit=10`
- `queries.ts:useRequestImport` — POST `/api/recipe-imports` (JSON или FormData); `setQueryData` и инвалидиране на `importKeys.recent`
- `queries.ts:useImport` — GET `/api/recipe-imports/:id`
- `clipboard.ts:readClipboard` — `navigator.clipboard.readText()`
- `resize-photo.ts:withBitmap`, `resize-photo.ts:drawJpeg` — `createImageBitmap` и canvas `toBlob`
- `shared-photo.ts:receiveShare`, `shared-photo.ts:takeSharedPhoto` — Cache API `family-share-target` под `/shared-photo`; 303 пренасочване
- `ImportScreen.tsx:ImportScreen` — navigate към заявката след „Внеси“ (с replace само при споделяне); replace и при чистене на `?rejected`
- `ImportPhotoForm.tsx:usePreviewUrls` — object URL-и за преглед на снимките (`URL.createObjectURL`, освобождават се при смяна или напускане)

## Verification
- Run: `pnpm --filter web test src/features/recipe-import`
