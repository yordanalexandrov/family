# step-photos — снимки на стъпките

## Overview
Снимки на стъпките на рецептата: качване във формата, миниатюра и преглед на цял екран. Снимката се смалява в браузъра и се праща към api-то; адресите идват от `stepPhotoUrl` в `@family/shared`.

## Interface
- `StepPhotoField.tsx:StepPhotoField` — „Снимка“/„Смени“/„Махни“; качва веднага и връща id-то през `onChange`
- `StepPhotoThumbnail.tsx:StepPhotoThumbnail`, `StepPhotoImage`, `THUMBNAIL_WIDTH` — миниатюра (240 px)
- `PhotoViewer.tsx:PhotoViewer`, `ViewerPhoto` — цял екран; затваря се с бутон, фон, Escape и „назад“; няколко снимки (частите на източника на рецепта) се превъртат с ‹ ›, стрелките и плъзгане, с номер „1/3“
- `queries.ts:useUploadStepPhoto` — смаляване (`resizeStepPhoto`) и качване

## Invariants
- `StepPhotoField.tsx:StepPhotoField` — изборът е изключен без връзка и докато тече качване; стъпката се свързва със снимката чак при „Запази“ на формата
- `StepPhotoField.tsx:mounted` — `onChange` се вика само ако полето още е монтирано
- `queries.ts:useUploadStepPhoto` — поле `photo`, име `photo.jpg`; отговорът минава `stepPhotoResponseSchema`

## Side Effects
- `queries.ts:useUploadStepPhoto` — POST `/api/step-photos` (multipart)
- `StepPhotoThumbnail.tsx:StepPhotoImage`, `StepPhotoThumbnail.tsx:StepPhotoThumbnail` — картини от `/api/step-photos/:id` (`?w=240` за миниатюра); `PhotoViewer` показва адреса, който му е подаден
- `PhotoViewer.tsx:PhotoViewer` — `keydown` на `document` и запис в историята (`useSheetHistory`)

## Verification
- Run: `pnpm --filter web test` (директорията няма собствени `*.spec.*`)
- Типове: `pnpm --filter web typecheck`
