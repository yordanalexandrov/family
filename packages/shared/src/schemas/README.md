# schemas

## Overview

Zod схемите на HTTP API-то (`apps/api`) и на ентитетите, които web чете: телата на заявките и отговорите, отказите (refusals) с под-код и състоянието, което web пази на устройството. И api, и web валидират с едни и същи схеми. Схемите ползват граници и проверки от [../food/README.md](../food/README.md), [../menu/README.md](../menu/README.md) и [../contracts/README.md](../contracts/README.md).

## Interface

- `dates.ts:dateKeySchema`, `instantSchema` — календарна дата и ISO 8601 момент.
- `error.ts:apiErrorCodeSchema`, `apiErrorSchema`, `refusalBody` (и `ApiErrorCode`, `ApiErrorResponse`) — тялото на всяка грешка на API-то и фабрика за отказ с под-код.
- `refusal.ts:refusalSchemas`, `refusalSchema`, `RefusalCode`, `RefusalOf`, `RefusalDetails`, `Refusal`, `refusalErrorOf`, `parseRefusal` — регистър на всички под-кодове на откази.
- `health.ts:healthSchema` — отговорът на `GET /healthz`.
- `user.ts:personColorSchema`, `userSchema`, `usersResponseSchema`, `meResponseSchema` — потребители и отговорът „аз“.
- `menu.ts:weekStartSchema`, `servingsSchema`, `mealSchema`, `mealPlanSchema`, `mealPlanSummarySchema`, `MEAL_NOTE_MAX` — Ястие, Седмично меню и порции.
- `menu.ts:mealCommentKindSchema`, `mealCommentSchema`, `createMealCommentSchema`, `mealCommentsResponseSchema`, `mealCommentResponseSchema`, `MEAL_COMMENT_MAX` — Разговорът на ястието.
- `menu.ts:mealPlansQuerySchema`, `mealPlanResponseSchema`, `mealPlansResponseSchema`, `createMealPlanSchema`, `mealResponseSchema`, `updateMealSchema`, `swapMealsSchema`, `putVoteSchema` — маршрутите `/api/menu/plans` и `/api/menu/meals/:id`.
- `menu.ts:menuProposalTriggerSchema`, `menuProposalRequestSchema`, `menuProposalsQuerySchema`, `createMenuProposalSchema`, `menuProposalResponseSchema`, `MENU_PROPOSE_MIN_RECIPES` и отказите `notEnoughRecipesSchema`, `noPlanSchema`, `noProposalSchema` — Предложение за меню.
- `menu.ts:systemLineSchema`, `pastMealSchema`, `emptyMealSchema` — 409 откази на ястието: системен ред при `DELETE /api/menu/comments/:id`; всеки запис по ястие преди днес (гласове, рецепта, бележка, `meal.replace`, разговор); глас за празен ден при `PUT /api/menu/meals/:id/vote`.
- `meal-replacement.ts:mealReplaceCandidateSchema`, `mealReplaceRequestSchema`, `mealReplaceResponseSchema`, `MEAL_REPLACE_MIN_RECIPES`, `noReplacementSchema` — едно изпълнение на `meal.replace` („Предложи друго“).
- `menu-rework.ts:menuReworkRequestSchema`, `createMenuReworkSchema`, `menuReworksQuerySchema`, `menuReworkResponseSchema`, `menuReworkingSchema`, `replacementPendingSchema`, `nothingToReworkSchema`, `noReworkSchema` — едно изпълнение на `menu.rework` („Преработи менюто“) и отказите му.
- `recipe.ts:nutritionSchema`, `recipeIngredientSchema`, `recipeStepSchema`, `recipeInputFieldsSchema`, `recipeInputSchema`, `replaceRecipeInputSchema`, `recipeLineSchema`, `recipeSchema`, `recipeResponseSchema`, `recipeSummarySchema`, `recipesResponseSchema`, `openRevisionSchema`, `ratingSchema`, `putRatingSchema` — рецептата в регистъра и нейната оценка.
- `recipe.ts:recipesQuerySchema`, `recipesSortSchema`, `recipeFiltersSchema`, `canonicalTitle`, `stepsOfText` — търсене и филтри на рецепти и чисти помощни функции.
- `recipe-import.ts:recipeImportSourceSchema`, `recipeImportRequestSchema`, `IMPORT_FIRST_LINE_MAX`, `alreadyImportedSchema`, `recipeImportResponseSchema`, `recipeImportsQuerySchema`, `recipeImportsResponseSchema`, `recipeImportDetailSchema` — импорт на рецепта (`recipe.normalize`).
- `recipe-suggestion.ts:suggestionRequestSchema`, `recipeSuggestionStatusSchema`, `duplicateOfSchema`, `suggestionPayloadSchema`, `importPayloadSchema`, `recipeSuggestionSchema`, `importedSuggestionSchema`, `anyRecipeSuggestionSchema`, `suggestionRequestResponseSchema`, `suggestionRequestsQuerySchema`, `suggestionRequestsResponseSchema`, `suggestionRequestDetailSchema`, `recipeSuggestionResponseSchema`, `approveSuggestionInputSchema`, `approvedSuggestionResponseSchema` — предложения за рецепти (`recipe.suggest` и импорт) и одобряването им.
- `recipe-refinement.ts:refinementSourceSchema`, `recipeRefinementSchema`, `recipeRefineRequestSchema`, `recipeRefineResponseSchema` — изпълнение на `recipe.refine`.
- `recipe-revision.ts:revisionLineSchema`, `recipeRevisionSchema`, `revisionDecisionSchema`, `recipeRevisionRequestSchema`, `requestRevisionSchema`, `revisableRecipeSchema`, `requestSuggestionRevisionSchema`, `recipeRevisionResponseSchema`, `revisionOpenSchema`, `revisionStaleSchema` — Поправка на рецептата (`recipe.revise`).
- `cooking-question.ts:askCookingQuestionSchema`, `cookingQuestionSchema`, `cookingQuestionResponseSchema`, `noEarlierQuestionSchema`, `noAppliedChangeSchema` — Въпрос в Готвене (`cooking.ask`).
- `cooking-memory.ts:rememberedQuestionsSchema`, `appliedChangesSchema`, `lastCookingAppliedSchema` — състоянието на Готвене, което web пази на устройството.
- `timer.ts:storedTimersSchema`, `StoredTimer` — таймерите на устройството.
- `step-photo.ts:STEP_PHOTO_MAX_SIDE`, `STEP_PHOTO_MAX_BYTES`, `STEP_PHOTO_MIN_WIDTH`, `stepPhotoResponseSchema`, `stepPhotoQuerySchema`, `stepPhotoUrl` — снимки на стъпки.
- `appliance.ts:applianceSchema`, `createApplianceSchema`, `updateApplianceSchema`, `appliancesResponseSchema`, `applianceResponseSchema`, `applianceExistsSchema`, `APPLIANCE_NAME_MAX` — Уред.
- `ingredient.ts:normalizeIngredientName`, `ingredientNameSchema`, `ingredientSchema`, `createIngredientSchema`, `updateIngredientSchema`, `ingredientsQuerySchema`, `ingredientsResponseSchema`, `ingredientResponseSchema`, `ingredientConflictSchema` — Продукт.
- `pantry.ts:pantryKindSchema`, `pantryItemSchema`, `useUpSchema`, `PANTRY_NOTE_MAX`, `createPantryItemSchema`, `updatePantryItemSchema`, `pantryResponseSchema`, `pantryItemResponseSchema`, `alreadyInPantrySchema`, `notStapleSchema` — Килер.
- `shopping.ts:shoppingItemKindSchema`, `shoppingAmountSchema`, `shoppingItemSourceSchema`, `shoppingItemPantrySchema`, `shoppingItemSchema`, `shoppingListSchema`, `ShoppingItemRecord`, `MANUAL_ITEM_TITLE_MAX`, `createManualItemSchema`, `setCheckedSchema`, `setHiddenSchema`, `shoppingListResponseSchema`, `shoppingItemResponseSchema`, `shoppingListParamsSchema`, `shoppingItemParamsSchema`, `shoppingMealParamsSchema`, `mealWithoutRecipeSchema` — Списък за пазаруване.
- `notifications.ts:notificationKindSchema`, `pushKindSchema`, `notificationSettingsSchema`, `notificationSettingsBodySchema`, `pushSubscriptionInputSchema`, `pushUnsubscribeSchema`, `vapidKeyResponseSchema`, `pushTestResponseSchema`, `pushPayloadSchema`, `pushActionSchema`, `appPathSchema`, `pushDisabledSchema`, `cookTakenSchema` — push известия.
- `inbox.ts:inboxItemSchema`, `inboxDetailSchema`, `inboxResponseSchema`, `inboxUnreadCountSchema` — Входящата кутия: `GET /api/inbox` и `GET /api/inbox/unread-count`.
- `calendar.ts:calendarColorTokenSchema`, `calendarSourceSchema`, `calendarEventSchema`, `dayEventsSchema`, `calendarEventsResponseSchema`, `calendarEventsQuerySchema`, `CALENDAR_MAX_DAYS` — календарът.
- `budget.ts:budgetSnapshotSchema` — Бюджетна снимка.
- `sync.ts:syncSourceSchema`, `freshnessSchema`, `lastRunStatusSchema`, `syncStatusSchema`, `syncRunResultSchema` — свежест на синхронизацията с външни източници.
- `dashboard.ts:cookingMealSchema`, `cookingSchema`, `dashboardThawSchema`, `dashboardResponseSchema` — отговорът на `GET /api/dashboard`.

## Invariants

- `dates.ts:dateKeySchema` — `YYYY-MM-DD`; `instantSchema` — ISO 8601 с отместване.
- `menu.ts:weekStartSchema` — дата, която е понеделник (`isWeekStart`).
- `menu.ts:MEAL_NOTE_MAX` — 80; `MEAL_COMMENT_MAX` — 500; `MENU_PROPOSE_MIN_RECIPES` — 7.
- `menu.ts:updateMealSchema` — `why` е позволено само заедно с `recipeId`.
- `menu.ts:servingsSchema` — цяло число >= 0 на потребител (0 значи, че човекът го няма).
- `error.ts:apiErrorCodeSchema` — фиксиран списък кодове (`validation_error`, `not_found`, `conflict`, `already_imported`, `openclaw_unavailable`, `internal_error` и др.); `issues` идва само с `validation_error`.
- `refusal.ts:refusalSchemas` — всеки под-код на отказ има точно една схема; `refusalSchema` е discriminated union по `code`; `refusalErrorOf` дава HTTP вида на грешката (`not_found` или `conflict`); `parseRefusal` връща данните или `null`.
- `ingredient.ts:normalizeIngredientName` — подрязва, свива празните места и прави малки букви; `recipe.ts:canonicalTitle` прави същото за заглавие и на него се крепи откриването на дубликати.
- `recipe.ts:recipeInputSchema`, `replaceRecipeInputSchema`, `recipe-suggestion.ts:approveSuggestionInputSchema`, `recipe-revision.ts:revisableRecipeSchema` — минават през `checkComponents`; `recipe.ts:recipeIngredientSchema` минава през `checkPinchQuantity`.
- `recipe.ts:ratingSchema` — цяло число от 1 до 5.
- `recipe.ts:recipeFiltersSchema` — снизходителна по поле: непознати етикети и времена отпадат, другите полета падат към стойност по подразбиране.
- `timer.ts:storedTimersSchema`, `cooking-memory.ts:rememberedQuestionsSchema` — запис, който не минава, се отказва изцяло.
- `pantry.ts:PANTRY_NOTE_MAX` — 80, празна бележка става `null`; `shopping.ts:MANUAL_ITEM_TITLE_MAX` — 60; `appliance.ts:APPLIANCE_NAME_MAX` — 200; `recipe-import.ts:IMPORT_FIRST_LINE_MAX` — 80.
- `step-photo.ts:STEP_PHOTO_MAX_SIDE` — 1600 px; `STEP_PHOTO_MAX_BYTES` — 10 MiB; `stepPhotoQuerySchema.w` е от 16 до 1600.
- `calendar.ts:CALENDAR_MAX_DAYS` — 14; `dashboard.ts:dashboardResponseSchema.days` е точно 4.
- `notifications.ts:pushPayloadSchema` — `url` е път в приложението (никога друг произход), `actions[].post` започва с `/api/`; `pushSubscriptionInputSchema.endpoint` е https адрес.
- `inbox.ts:inboxItemSchema` — `kind` е вид известие (без `test`), `url` е път в приложението (`appPathSchema`); `details` е винаги масив (може празен), а `url` на ред от тях е по избор и също път в приложението. `actions` (като в push-а) и `answered` никога не идват заедно.
- `recipe-suggestion.ts:recipeSuggestionStatusSchema` — `proposed`, `approved` или `rejected`; `anyRecipeSuggestionSchema` е discriminated union по `origin` (`suggest` или `import`).
- `budget.ts:budgetSnapshotSchema.currency` — три главни букви (ISO 4217).

## Side Effects

- None. Файловете само описват схеми, типове и константи; `step-photo.ts:stepPhotoUrl`, `recipe.ts:canonicalTitle`, `recipe.ts:stepsOfText`, `refusal.ts:refusalErrorOf` и `refusal.ts:parseRefusal` са чисти функции. Ключовете в localStorage (`family.timers`, `family.recipeFilters`) са само в коментари; тук нищо не чете и не пише хранилище.

## Verification

- Run: `pnpm --filter @family/shared test src/schemas`
