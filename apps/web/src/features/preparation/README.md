# preparation — „Подготовка“ на рецептата

## Overview
UI за „Подготовка“ на рецептата (фурна, изваждане, накисване): поле във формата с лист за един елемент, изглед само за четене и преобразуване между стойностите на формата и `preparationSchema` от `@family/shared`. Няма мрежови заявки; проверката е в схемата на рецептата.

## Interface
- `PreparationField.tsx:PreparationField`, `PreparationField.tsx:Reindex` — контролираното поле във формата
- `PreparationSheet.tsx:PreparationSheet` — лист за един елемент
- `PreparationItemLabel.tsx:PreparationItemLabel`, `PreparationItemLabel.tsx:PreparationKindIcon` — икона и надпис (и в Готвене)
- `PreparationList.tsx:PreparationList` — списък само за четене
- `preparation-values.ts:PreparationItemValues`, `emptyPreparationItem`, `preparationToValues`, `valuesToPreparation`, `preparationValuesLabel`, `MINUTES_BEFORE_CHOICES` — стойности на формата

## Invariants
- `PreparationField.tsx:add` — „Добави подготовка“ само докато `items.length < PREPARATION_MAX`
- `PreparationField.tsx:close` — нов елемент, затворен без вид, се маха; местене и махане подават `reindex`, за да следват грешките елемента си
- `PreparationSheet.tsx:PreparationSheet` — фурната е само една (`ovenTaken`)
- `preparation-values.ts:valuesToPreparation` — елемент без вид се изпуска; за `oven` се пращат само `degrees`/`fan`/`rack`, за другите `text` и `minutesBefore`
- `preparation-values.ts:parseDegrees` — празни или нечислови градуси стават `NaN`, който схемата хваща

## Side Effects
- `PreparationField.tsx:PreparationField` — `createPortal` на листа в `document.body`

## Verification
- Run: `pnpm --filter web test` (директорията няма собствени `*.spec.*`)
- Типове: `pnpm --filter web typecheck`
