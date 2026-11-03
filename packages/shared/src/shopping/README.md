# shopping

## Overview

Чистата логика на Списъка за пазаруване: от седмичното меню, рецептите, записите за отметки и скривания и Килера сглобява списъка за седмицата, групиран по пътеки на магазина. Едни и същи функции вървят и на api (отговорът на `/api/shopping-lists/...`), и на web (офлайн отметка). Схемите на тялото на заявките са в [../schemas/README.md](../schemas/README.md).

## Interface

- `build.ts:BuildShoppingListInput`, `buildShoppingList` — вход `{ weekStart, plan | null, listedMealIds, recipes, items, pantry? }`, изход `ShoppingList` (`weekStart`, `hasMenu`, `listedMealIds`, `aisles`, `hidden`, `pantryHidden`, `total`, `remaining`).
- `build.ts:checkState` — превръща отметка в `{ checkedBy, checkedAt }` или в два `null`.
- `build.ts:withCheck` — прилага офлайн отметка или махане на отметка по ключ, пренарежда пътеката и преброява `remaining` наново.
- `item-key.ts:computedItemKey`, `manualItemKey` — ключ на изчислен ред и на ръчен ред.
- `item-key.ts:ParsedItemKey`, `parseItemKey`, `normalizeItemKey` — четене на ключ и превръщане на стари ключове в текущия формат.

## Invariants

- `item-key.ts:computedItemKey` — ключът е самото `ingredientId`; `manualItemKey` дава `manual:<id>`.
- `item-key.ts:parseItemKey` — повече от две части, разделени с `:`, дава `null`; `<uuid>`, `<uuid>:none` и `<uuid>:<единица, различна от kg и l>` са изчислени редове; `normalizeItemKey` свежда стари `<id>:<unit>` до `<id>`.
- `build.ts:buildShoppingList` — броят се само ястията от `listedMealIds`, които имат рецепта и `totalServings > 0`, по ред на датата; ястие с липсваща рецепта не добавя нищо.
- `build.ts:buildShoppingList` — един ред на продукт; количествата се събират по единица за седмицата и по ястие след `normalizeQuantity` (kg→g, l→ml през `scaleToServings`); несъвместими единици (бр. и г) не се превръщат една в друга; щипка (количество `null`) се пази веднъж без количество.
- `build.ts:scaleLine` — основен ред се мащабира от `recipe.servings`; ред на компонент се мащабира в цели партиди чрез `defaultComponentServings`.
- `build.ts:amountsOf` — първо основната единица на продукта, после останалите по реда на `unitSchema`, щипката накрая; първото количество става `quantity`/`unit`, останалите са в `extraAmounts`.
- `build.ts:roundUp` — общото за седмицата се закръгля нагоре до 10 за g и ml и до 1 за другите единици (с толеранс 1e-9); количествата по ястие ползват `roundMilli`.
- `build.ts:buildShoppingList` — Килерът никога не изважда количества: основен продукт отива в `pantryHidden`, освен ако е свършил, е скрит ръчно или е отметнат; свършил основен продукт, който менюто не иска, получава ред без количество; свършил основен продукт не може да се скрие ръчно (`hidden` е `false`, докато `ranOutAt !== null`); отметка важи само ако `checkedAt >= ranOutAt`; продукт „за изразходване“ получава само бележка `pantry`.
- `build.ts:buildShoppingList` — ръчните записи стават редове в пътека `other`, когато нямат своя, и никога не се скриват; `total` и `remaining` броят само видимите редове.
- `build.ts:compareItems` — пътеките следват `AISLES` по `order`, празните отпадат; в пътека първо са неотметнатите, после по заглавие (`localeCompare` с `bg`), после по ключ.

## Side Effects

- None. `build.ts:buildShoppingList` сортира само копия, а `build.ts:withCheck` връща нов списък.

## Verification

- Run: `pnpm --filter @family/shared test src/shopping`
