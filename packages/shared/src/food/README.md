# food

## Overview

Домейнът на храната, общ за api, web и AI контрактите: единици и количества, мащабиране по порции, пътеки на магазина, етикети и слотове, компоненти на рецептата, подготовка (фурна и други видове), промени по време на Готвене, разкрояване на снимки за импорт и нормализиране на линк към източник.

## Interface

- `units.ts:unitSchema`, `Unit`, `baseUnitSchema`, `BaseUnit`, `UNIT_LABELS_BG`, `normalizeQuantity`, `roundMilli`, `quantitySchema`, `checkPinchQuantity` — единици, превръщане към малката единица, закръгляне и правилото за щипка.
- `scale.ts:Amount`, `scaleToServings`, `scaleQuantity` — мащабиране на количество между порции (без закръгляне за сбор, или закръглено за показване).
- `aisles.ts:AISLES`, `Aisle`, `aisleSchema` — 11-те пътеки на магазина в реда, в който се минават.
- `tags.ts:slotSchema`, `Slot`, `tagSchema`, `Tag`, `TAG_LABELS_BG` — слотове на ястие и фиксиран списък етикети.
- `prep-time.ts:prepTimeRangeSchema`, `PrepTimeRange`, `PREP_TIME_RANGES`, `PREP_TIME_LABELS_BG`, `inPrepTimeRanges` — интервали за време за приготвяне.
- `component.ts:COMPONENTS_MAX`, `COMPONENT_NAME_MAX`, `recipeComponentSchema`, `RecipeComponent`, `recipeComponentsSchema`, `recipeComponentsWireSchema`, `componentIndexSchema`, `lineComponentWireSchema`, `lineComponentSchema`, `componentCountersSchema` — компонент на рецептата и връзката на ред с компонент.
- `component.ts:checkComponents`, `checkRecipeComponents`, `batches`, `defaultComponentServings`, `componentCounter`, `linesByComponent` — проверки и сметки за партиди.
- `preparation.ts:PREPARATION_KINDS`, `PreparationKind`, `preparationKindSchema`, `preparationKind`, `ovenFanSchema`, `ovenRackSchema`, `OVEN_FAN_LABELS_BG`, `OVEN_RACK_LABELS_BG`, `ovenPreparationSchema`, `textPreparationSchema`, `preparationItemSchema`, `preparationSchema`, `isSecondOvenIssue` — подготовката на рецептата.
- `preparation.ts:PREPARATION_MAX`, `OVEN_DEGREES_MIN`, `OVEN_DEGREES_MAX`, `PREPARATION_TEXT_MAX`, `MINUTES_BEFORE_MAX`, `FROM_THE_EVENING_MINUTES`, `formatMinutesBefore`, `PreparationLabelItem`, `preparationLabel` — граници и етикети на български.
- `cooking-change.ts:COOKING_CHANGE_NAME_MAX`, `COOKING_CHANGE_STEP_MAX`, `changedIngredientSchema`, `ingredientChangeSchema`, `stepChangeSchema`, `cookingChangeSchema` (и типовете `ChangedIngredient`, `IngredientChange`, `StepChange`, `CookingChange`) — промяна в Готвене: `replace`, `remove`, `add` на продукт и нов текст на стъпка.
- `cooking-change.ts:CookingLineComponent`, `CookingLine`, `CookingServings`, `AppliedCookingChange`, `CookingStep`, `cookingServings`, `recipeCookingLines`, `changedCookingLine`, `scaleCookingLine` — редовете и порциите на екрана Готвене.
- `cooking-change.ts:applyCookingChanges`, `withoutCookingChange`, `applyStepChanges`, `describeCookingChanges` — прилагане, отмяна и описание на промените.
- `import-photo.ts:IMPORT_PHOTO_MAX_SIDE`, `IMPORT_PHOTO_JPEG_QUALITY`, `IMPORT_PHOTO_MAX_PARTS`, `ImportPhotoTile`, `ImportPhotoLayout`, `importPhotoLayout` — размер и парчета на снимка или дълъг скрийншот за импорт.
- `source-url.ts:normalizeSourceUrl`, `displaySourceUrl` — каноничен линк за откриване на дубликати и четим вид за показване.

## Invariants

- `units.ts:normalizeQuantity` — превръща само kg→g и l→ml (×1000, после `roundMilli`); лъжиците никога не стават грамове; `roundMilli` закръгля до 0.001.
- `units.ts:quantitySchema` — положително число или `null`; `checkPinchQuantity` отказва щипка (`pinch`) с количество, различно от `null`.
- `scale.ts:scaleToServings` — без закръгляне; `scaleQuantity` закръгля и показва g >= 1000 като kg и ml >= 1000 като l; щипката остава `null`.
- `component.ts:COMPONENTS_MAX` — 3; `COMPONENT_NAME_MAX` — 40; порциите на компонент и броячите са цели числа >= 1.
- `component.ts:checkComponents` — индексът на компонент на всеки ред трябва да е < броя компоненти и всеки компонент трябва да има поне един ред.
- `component.ts:batches` — `ceil(servings / component.servings)`; `defaultComponentServings` е броят партиди по порциите на компонента.
- `preparation.ts:preparationSchema` — най-много `PREPARATION_MAX` (8) елемента и най-много една фурна; втората фурна получава грешка, която `isSecondOvenIssue` разпознава.
- `preparation.ts:OVEN_DEGREES_MIN`, `OVEN_DEGREES_MAX` — 30 до 300 градуса; `PREPARATION_TEXT_MAX` — 60 знака; `MINUTES_BEFORE_MAX` — 2880; `formatMinutesBefore` пише „от вечерта“ при >= `FROM_THE_EVENING_MINUTES` (480).
- `preparation.ts:preparationKind` — хвърля грешка при непознат вид.
- `cooking-change.ts:cookingChangeSchema` — промяната не може да е празна; най-много един `replace`/`remove` на индекс на ред (`add` е изключение) и най-много един запис на номер на стъпка; `COOKING_CHANGE_NAME_MAX` е 100, `COOKING_CHANGE_STEP_MAX` е 1000.
- `cooking-change.ts:applyCookingChanges` — промените се прилагат по ред и по-късната печели; `remove` маркира реда `removed: true` на място, затова индексите никога не се местят; `add` добавя в края.
- `cooking-change.ts:withoutCookingChange` — маха промяната и всяка по-късна, чиито индекси вече не пасват.
- `cooking-change.ts:applyStepChanges` — броят на стъпките никога не се променя.
- `prep-time.ts:inPrepTimeRanges` — долната граница е изключена, горната включена; празен списък приема всяко време.
- `import-photo.ts:importPhotoLayout` — `IMPORT_PHOTO_MAX_SIDE` е 2000, `IMPORT_PHOTO_MAX_PARTS` е 8, качество JPEG 0.85; снимката никога не се уголемява; снимка, по-висока от 2.2 пъти ширината си (`TALL_RATIO`), е дълъг скрийншот: смалява се до най-много 1200 px ширина (`TALL_MAX_WIDTH`) и се реже на парчета с еднаква височина до 2000 px и застъпване 80 px (`PART_OVERLAP`); ако трябват повече от 8 парчета, се стеснява, докато 8 стигнат.
- `source-url.ts:normalizeSourceUrl` — малки букви за схема и хост (пътят пази регистъра си), без фрагмент и крайни наклонени черти, без tracking параметри (`utm_*`, `fbclid`, `gclid` и др.); escape-ите се уеднаквяват (`canonicalEscapes`: escape на обикновен знак се декодира, другите са с главни букви, знак извън печатния ASCII се escape-ва като UTF-8), така че кирилски път и формата му `%D0%9A…` дават един линк; линк без схема се връща само подрязан.

## Side Effects

- None. Няма вход/изход; `cooking-change.ts:applyCookingChanges`, `withoutCookingChange` и `applyStepChanges` копират масивите си и не променят аргументите.

## Verification

- Run: `pnpm --filter @family/shared test src/food`
