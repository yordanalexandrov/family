# pantry — Килерът

## Overview
Екранът „Килер“ (`/pantry`): постоянни и временни продукти, лист за добавяне и куки към api-то. Промените са оптимистични в общ кеш `pantryKeys.all`; изтриването чака зад toast-а „Върни“. „Свърши“ и „Имаме го винаги“ не са оптимистични и засягат и списъка за пазаруване.

## Interface
- `queries.ts:pantryKeys`, `queries.ts:usePantry` — кешът и списъкът на килера
- `queries.ts:useAddPantryItems`, `queries.ts:AddPantryItems`, `useSetPantryKind`, `useSetPantryFrozen`, `useRemovePantryItem` — добавяне, вид, „Във фризера“, изтриване
- `queries.ts:useMarkRanOut`, `queries.ts:useMakeStaple` — „Свърши“ и „Имаме го винаги“ (ползват се и от `features/shopping`)
- `PantryScreen.tsx:PantryScreen`, `PantryScreen.tsx:formatPantryAge` — екранът и „от N дни“
- `AddPantrySheet.tsx:AddPantrySheet` — лист „Добави в килера“ с търсене, избор на няколко продукта и „Нов продукт“

## Invariants
- `queries.ts:applyOptimistic`, `queries.ts:rollbackAndRefresh` — промяна се прилага само върху съществуващ кеш, връща се при грешка, а `onSettled` винаги инвалидира `pantryKeys.all`
- `queries.ts:useAddPantryItems` — оптимистичните редове са с id `pending:<ingredientId>`; бележката се праща само непразна
- `queries.ts:useSetPantryKind` — към `use_up` нулира `ranOutAt`
- `queries.ts:useMakeStaple` — с `pantryId` е PATCH към `staple`, иначе POST
- `queries.ts:useChangeFromShopping` — „Свърши“ и „Имаме го винаги“ инвалидират и `pantryKeys.all`, и `shoppingKeys.all`
- `PantryScreen.tsx:useDeferredRemoval` — изтриването чака toast-а; ново изтриване изпраща предишното; при `pagehide`, скриване и размонтиране се изпраща веднага, както и при всяко друго действие на ред (`onAction`) и при „Добави“; „Върни“ отменя без заявка
- `PantryScreen.tsx:Groups` — „Свърши“ е изключено офлайн, за ред `pending:` или ако вече е отбелязано; вид, фризер и „махни“ са изключени за ред `pending:`
- `PantryScreen.tsx:Groups` — постоянните са по име, временните от най-старите; след „Добави“ `PantryScreen` превърта до първия нов ред
- `AddPantrySheet.tsx:AddPantrySheet` — търсене с 200 ms debounce; продукти, които вече са в килера, не се предлагат; „Нов продукт“ се показва само без точно съвпадение по `normalizeIngredientName`; листът се затваря, без да чака api-то

## Side Effects
- `queries.ts:usePantry` — GET `/api/pantry`
- `queries.ts:postPantryItem`, `queries.ts:patchPantryItem` — POST `/api/pantry`, PATCH `/api/pantry/:id`
- `queries.ts:useRemovePantryItem` — DELETE `/api/pantry/:id` с `keepalive: true`
- `queries.ts:useMarkRanOut` — POST `/api/pantry/:id/ran-out`
- `PantryScreen.tsx:useDeferredRemoval` — слушатели `pagehide` и `visibilitychange`
- `AddPantrySheet.tsx:AddPantrySheet` — търси през `useIngredientSearch` от `features/recipes` (GET `/api/ingredients?q=`); създава продукт на място през `NewIngredientForm` от `features/recipes`

## Verification
- Run: `pnpm --filter web test src/features/pantry`
