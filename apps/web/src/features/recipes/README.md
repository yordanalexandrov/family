# recipes — регистърът на рецептите

## Overview
Рецептите: регистърът с търсене и филтри, изгледът на една рецепта, формата за нова рецепта и редакция с листовете ѝ (продукт, стъпка, компонент, нов продукт) и AI потоците „Подобри рецептата“, „Поправи с AI“ (поправка на рецептата) и „Как мина?“. Слоят за данни е в `queries.ts`, `refinements.ts` и `revisions.ts`; преобразуването форма ↔ `RecipeInput` е в `recipe-form-values.ts`.

## Interface
- `queries.ts:recipeKeys`, `useRecipes`, `useRecipe`, `useSaveRecipe`, `useArchiveRecipe`, `useRateRecipe`, `storeRecipe` — регистър, детайл, запис, архив, оценка
- `queries.ts:ingredientSearchQuery`, `useIngredientSearch`, `useCreateIngredient` — търсене и „Нов продукт“
- `recipe-form-values.ts:toRecipeInput`, `recipeToFormValues`, `emptyRecipeFormValues`, `toRevisableRecipe`, `RecipeFormValues` — стойности на формата
- `recipe-form-values.ts:componentErrors`, `ingredientRowErrors`, `componentsToValues`, `lineComponent`, `emptyIngredientRow`, `newRowKey`, `nutritionToValues`, `baseUnitFor`, `ingredientLineName`, `ingredientLineText` — редове, компоненти и грешки на листовете
- `RecipeForm.tsx:RecipeForm`, `RecipeForm.tsx:AiReplacement` — контролираната форма и приетите AI промени
- `RecipeEditor.tsx:NewRecipeScreen`, `EditRecipeScreen`, `parseEditRecipeSearch` — `/recipes/new` и `/recipes/$id/edit` (`?revise`)
- `RecipeList.tsx:RecipeList`, `RecipeView.tsx:RecipeView`, `RecipeFiltersSheet.tsx:RecipeFiltersSheet`, `RecipeFilters`, `NO_FILTERS`, `clearedFilters`, `countFilters` — регистър, рецепта, филтри
- `IngredientLineSheet.tsx:IngredientLineSheet`, `IngredientPicker.tsx:IngredientPicker`, `NewIngredientForm.tsx:NewIngredientForm`, `StepSheet.tsx:StepSheet`, `ComponentSheet.tsx:ComponentSheet` — листовете на формата
- `refinements.ts:useRequestRefinement`, `useRefinement`; `RefineSheet.tsx:RefineSheet`, `ComparisonColumn` — „Подобри рецептата“
- `revisions.ts:useRequestRevision`, `useRevision`, `useRejectRevision`, `useRefreshRevision`, `revisionReplacement`, `revisionBaseOf`, `RevisionTarget`, `RevisionBase`, `ComparedLine` (ползват се и от `features/suggestions` за поправка на предложение); `ReviseSheet.tsx:ReviseSheet`; `OpenRevisionBadge.tsx:OpenRevisionBadge` — „Поправи с AI“
- `CookingFeedbackSheet.tsx:CookingFeedbackSheet`, `Stars.tsx:RatingStars`, `Stars.tsx:StarsBadge`, `Stars.tsx:ratingText` — „Как мина?“ и оценка
- `format.ts:formatMinutes`, `formatDateTime`, `sourceDomain`, `productCount`, `componentHeading`, `shorten`, `componentName`, `MINUTES_PER_HOUR`; `stored-filters.ts:useStoredRecipeFilters`; `useDebouncedValue.ts:useDebouncedValue`; `TagChips.tsx:TagChips`, `TimeChips`, `toggled` (и в `features/suggestions`); `ApplianceBadge.tsx:ApplianceBadge` — помощници

## Invariants
- `queries.ts:recipesSearch` — стойностите по подразбиране не влизат в адреса, така че еднакви филтри дават един ключ
- `queries.ts:useSaveRecipe` — без `id` е POST, с `id` е PUT, който заменя цялата рецепта
- `queries.ts:useRateRecipe` — `null` е DELETE; оптимистично върху рецептите и плановете на менюто, с връщане при грешка
- `queries.ts:useCreateIngredient` — 409 се връща като `{status: 'exists'}`
- `recipe-form-values.ts:toRecipeInput` — проверка с `recipeInputSchema`; празните незадължителни полета се пропускат; втора фурна дава „Фурната е само една“
- `RecipeForm.tsx:submit` — с `requireResolvedIngredients` не праща, докато има несвързан ред, а отваря листа на първия такъв
- `RecipeForm.tsx:RecipeForm` — `aiReplacement` се прилага веднъж за нов `key` (`replacedKey`)
- `RecipeEditor.tsx:useSaveAndView` — 409 `revision_stale` не записва и опреснява поправката
- `RecipeView.tsx:RecipeDetails` — оценка, редакция и архив искат действащ потребител; „Готви“ и „Как мина?“ само на интерактивно устройство
- `RecipeList.tsx:RecipeList` — „Поискай предложения“, „Внеси“ и „+ Нова“ само на лично устройство; търсенето е с 300 ms debounce
- `IngredientPicker.tsx:SEARCH_DEBOUNCE_MS` — autocomplete-ът на продуктите е с 200 ms debounce
- `revisions.ts:postKnown` — при `no_applied_change` пита пак без непознатите id, затова опитите свършват
- `revisions.ts:useRevision`, `refinements.ts:useRefinement` — проверяват само докато са `pending`
- `ReviseSheet.tsx:openRevision` — отказ `revision_open` води към чакащата поправка; остаряла поправка няма „Приеми“
- `CookingFeedbackSheet.tsx:revisionOpen` — при отворена поправка не се пуска втора
- `stored-filters.ts:parse` — невалидните филтри отпадат през `recipeFiltersSchema`

## Side Effects
- `queries.ts:useRecipes`, `useRecipe` — GET `/api/recipes`, GET `/api/recipes/:id`
- `queries.ts:useSaveRecipe`, `useArchiveRecipe`, `useRateRecipe` — POST `/api/recipes`, PUT `/api/recipes/:id`, POST `.../archive`/`.../unarchive`, PUT/DELETE `.../rating`
- `queries.ts:ingredientSearchQuery`, `useCreateIngredient` — GET `/api/ingredients?q=`, POST `/api/ingredients`
- `refinements.ts:useRequestRefinement`, `useRefinement` — POST `/api/recipes/:id/refinements`, GET `/api/recipes/refinements/:id`
- `revisions.ts:postRevision`, `useRevision`, `useRejectRevision` — POST `/api/recipes/:id/revisions` или `/api/recipe-suggestions/:id/revisions`, GET `/api/recipes/revisions/:id`, POST `.../reject`
- `stored-filters.ts:useStoredRecipeFilters` — sessionStorage `family.recipeFilters`
- `CookingFeedbackSheet.tsx:CookingFeedbackSheet` — чете `lastCookingApplied` (localStorage `family.cooking.progress`); пуска поправка (POST `/api/recipes/:id/revisions` през `useRequestRevision`) и записва оценка (PUT/DELETE `.../rating` през `useRateRecipe`)
- `RecipeEditor.tsx:useSaveAndView` — навигация към `/recipes/$id` след запис

## Verification
- Run: `pnpm --filter web test src/features/recipes`
