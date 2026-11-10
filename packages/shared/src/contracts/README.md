# contracts

## Overview

AI контрактите между api и OpenClaw агентите: за всеки контракт входът, който api изпраща, JSON Schema за strict structured outputs и схемата, с която api проверява отговора. Изходната схема се строи от входа, затова правилата, които зависят от входа (познати `id`, дати от седмицата, снимки на стъпки), се проверяват при парсване. Съобщенията за грешка са на български и се връщат на агента като съобщение за повторен опит. Промптовете на агентите са в `docs/openclaw/`.

Папката `fixtures/` държи примерни входове и валидни изходи (JSON) за тестовете и не е част от публичния интерфейс.

## Interface

- `contract.ts:AiContract` — `{ id, inputSchema, outputSchema(input), responseFormat: { name, schema } }`.
- `cooking-ask.ts:cookingAsk` — контракт `cooking.ask` (Въпрос в Готвене); `CookingAskInput`, `CookingAskOutput` (`{ answer, change? }`), `cookingQuestionTextSchema`, `COOKING_QUESTION_MAX`, `COOKING_ANSWER_MAX`, `COOKING_HISTORY_MAX`.
- `menu-propose.ts:menuPropose` — контракт `menu.propose` (Предложение за меню); `menuProposeRecipeSchema`, `MenuProposeRecipe`, `MenuProposeInput`, `MenuProposeOutput`, `ProposedDay`.
- `menu-rework.ts:menuRework` — контракт `menu.rework` (Преработка на менюто); `MenuReworkInput`, `MenuReworkDay`, `MenuReworkOutput`, `ReworkedDay`.
- `meal-replace.ts:mealReplace` — контракт `meal.replace` („Предложи друго“); `MealReplaceInput`, `MealReplaceOutput`, `validateReplacement`, `MEAL_REPLACE_MAX_CANDIDATES`.
- `recipe-normalize.ts:recipeNormalize` — контракт `recipe.normalize` (импорт от текст, страница или снимка); `recipeImportParamsSchema`, `RecipeImportParams`, `RecipeNormalizeSource`, `RecipeNormalizeInput`, `RecipeNormalizeOutput`, `registryIngredientSchema`, `newProductSchema`, `NewProduct`, `normalizedIngredientFields`, `normalizedIngredientSchema`, `importedIngredientSchema`, `NormalizedIngredient`, `normalizedRecipeSchema`, `NormalizedRecipe`, `NormalizedStep`, `StepImageRef`.
- `recipe-normalize.ts:IMPORT_TEXT_MAX`, `IMPORT_PHOTO_MAX_BYTES`, `IMPORT_PHOTOS_MAX_BYTES`, `IMPORT_PHOTO_TYPES`, `ImportPhotoType` — граници на импорта.
- `recipe-refine.ts:recipeRefine` — контракт `recipe.refine`; `refineStepSchema`, `RefineStep`, `refineRecipeSchema`, `ContractRecipe`, `RecipeRefineInput`, `Refinement`, `RecipeRefineOutput`, `recipePhotoRefs`, `validateRefinement`.
- `recipe-revise.ts:recipeRevise` — контракт `recipe.revise` (Поправка на рецептата); `revisionInstructionSchema`, `RECIPE_REVISION_INSTRUCTION_MAX`, `RecipeReviseInput`, `RevisedRecipe`, `RecipeReviseOutput`.
- `recipe-suggest.ts:recipeSuggest` — контракт `recipe.suggest`; `recipeSuggestParamsSchema`, `RecipeSuggestParams`, `RecipeSuggestInput`, `RecipeSuggestOutput`, `suggestionSchema`, `Suggestion`, `SuggestionIngredient`.
- `failure.ts:CONTRACT_FAILURES`, `contractFailureSchema`, `ContractFailure` — кодовете за неуспех на изпълнение.
- `request.ts:contractRequestStatusSchema`, `ContractRequestStatus` — `pending`, `done`, `failed`.
- `hint.ts:HINT_MAX`, `hintSchema` — свободната подсказка към агента.
- Вътрешни (не се изнасят от `src/index.ts`): `preparation.ts:preparationStrictSchema`, `preparation.ts:preparationFromStrict`, `step-images.ts:stepImageProblems`, `strict-mode.ts:isRecord`, `strict-mode.ts:withoutNulls`.

## Invariants

- Промяна на контракт в тази папка изисква smoke срещу реалния агент преди merge, според `AGENTS.md` и `docs/openclaw/README.md` (раздел „Smoke преди merge“); CI job `smoke-gate` стои червен, докато коментарът със smoke не е публикуван.
- Всеки контракт (`cooking-ask.ts:cookingAsk`, `menu-propose.ts:menuPropose`, `menu-rework.ts:menuRework`, `meal-replace.ts:mealReplace`, `recipe-normalize.ts:recipeNormalize`, `recipe-refine.ts:recipeRefine`, `recipe-revise.ts:recipeRevise`, `recipe-suggest.ts:recipeSuggest`) — `responseFormat.schema` не носи правилата между полетата, затова отговорът винаги се парсва наново с `outputSchema(input)`; в strict режим незадължителните полета идват като `null` и се махат преди парсване (`strict-mode.ts:withoutNulls`, `preparation.ts:preparationFromStrict`).
- `failure.ts:CONTRACT_FAILURES` — `timeout`, `invalid_output`, `no_results`, `aborted`, `stale`, `error`, `fetch_blocked`, `fetch_failed`; `contractFailureSchema` приема и `http_<число>`.
- `hint.ts:hintSchema` — подрязан низ, най-много `HINT_MAX` (200) знака.
- `cooking-ask.ts:cookingQuestionTextSchema` — 1 до `COOKING_QUESTION_MAX` (300) знака; отговорът е 1 до `COOKING_ANSWER_MAX` (800); историята е най-много `COOKING_HISTORY_MAX` (5); текущата стъпка е между 1 и броя стъпки; индексите на продуктите на входната рецепта са 0..n-1 по ред, а номерата на стъпките 1..n по ред; промяна по ред, различна от `add`, сочи съществуващ ред, а стъпки не се добавят.
- `menu-propose.ts:menuPropose` — входът е `z.strictObject` (стари полета се отказват); отговорът има точно 7 дни; всяка двойка дата и слот от седмицата я има точно веднъж, всяка рецепта е от входа и не се повтаря.
- `menu-rework.ts:menuRework` — входът е `z.strictObject`, денят е `past`, `keep` или `fill` (с `reason` и `thread`); отговорът има всеки ден `fill` точно веднъж и никой друг, всяка рецепта е от входа и не се повтаря.
- `meal-replace.ts:validateReplacement` — 1 до `MEAL_REPLACE_MAX_CANDIDATES` (3) кандидата, всеки `recipeId` е от входа и не се повтаря.
- `recipe-normalize.ts:recipeNormalize` — точно едно от `recipe` и `noResults` не е `null` (същото правило имат `recipe-refine.ts:recipeRefine` и `recipe-revise.ts:recipeRevise`, всеки със свой `checkAnswerShape`); всеки ред сочи точно едно от `ingredientId` и `newProduct`; всеки `ingredientId` е от регистъра във входа; текстът е 1 до `IMPORT_TEXT_MAX` (20 000) знака; извлечената страница е само http или https.
- `recipe-normalize.ts:IMPORT_PHOTO_MAX_BYTES`, `IMPORT_PHOTOS_MAX_BYTES`, `IMPORT_PHOTO_TYPES` — 10 MiB на снимка, 20 MiB общо, JPEG/PNG/WebP/HEIC/HEIF; тук са само константи, проверява ги извикващият.
- `recipe-refine.ts:validateRefinement` — снимките на стъпки са само познати препратки, всяка на най-много една стъпка (`step-images.ts:stepImageProblems`); всяка собствена снимка на рецептата остава на стъпка; ако рецептата има `prepMinutes`, отговорът го пази.
- `recipe-revise.ts:recipeRevise` — инструкцията е 1 до `RECIPE_REVISION_INSTRUCTION_MAX` (500) знака; всеки `ingredientId` е от регистъра; снимки на стъпки са само собствените на рецептата, всяка най-много веднъж, и снимка може да отпадне.
- `recipe-suggest.ts:recipeSuggest` — 3 до 5 предложения или `noResults`; няма две предложения от една страница и най-много 2 от един сайт; уредът, ако го има, е точно един от уредите във входа; всяко предложение има поне 2 продукта и поне 2 стъпки.
- `recipe-refine.ts:recipeRefine`, `recipe-revise.ts:recipeRevise`, `recipe-normalize.ts:recipeNormalize` — компонентите минават през `checkRecipeComponents` от `src/food`; входната рецепта на `cooking-ask.ts:cookingAsk` и всяко предложение на `recipe-suggest.ts:recipeSuggest` минават през `checkComponents`.
- `recipe-suggest.ts:recipeSuggest`, `recipe-normalize.ts:normalizedIngredientSchema`, `importedIngredientSchema` — щипката е без количество (`checkPinchQuantity` от `src/food`).

## Side Effects

- None. Файловете само описват схеми и чисти функции за проверка; извикването на агента е в api.

## Verification

- Run: `pnpm --filter @family/shared test src/contracts`
