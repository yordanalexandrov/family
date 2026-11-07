# db/repositories

## Overview

Слоят за достъп до данните: функции върху Drizzle, по една за всяка заявка към Postgres. Всяка приема `Db` или `DbExecutor` от `../client.ts` (пул или транзакция) и превръща редовете в API формата от `packages/shared` (обикновено DB `null` на незадължителни полета става липсващо поле, датите стават ISO низове). Изключения: `shopping.ts`, `calendar-events.ts:listCachedEvents` пазят `null`, а `sync-runs.ts:lastRuns` и `menu.ts:findRemoval` връщат суровия Drizzle ред (`Date`, `null`). Тук няма бизнес правила извън заключванията и проверките, които трябва да са атомарни; правилата са в `src/services`. Файловете не четат env, не правят мрежови заявки и не пипат диска.

## Interface

- `appliances.ts:listAppliances, listEnabledApplianceNames, insertAppliance, setApplianceEnabled, deleteAppliance, APPLIANCE_NAME_UNIQUE` – Уредите (`appliance`), подредени по `createdAt`, после `id`.
- `budget-snapshots.ts:insertSnapshot, latestSnapshot` – добавя бюджетна снимка (само добавяне) и чете най-новата.
- `calendar-events.ts:replaceSourceEvents, listCachedEvents, TimeWindow` – подменя кешираните събития на един източник в прозорец `[from, to)`, после ги чете заедно с източника им.
- `calendar-sources.ts:upsertCalendarSources, listEnabledSources, EnabledCalendarSource` – привежда `calendar_source` в съответствие с конфигурираните календари.
- `contract-requests.ts:finishContractRequest, failPendingContractRequestsBefore, ContractRequestTable` – общ жизнен цикъл на AI заявките за всяка таблица `*_request`.
- `cooking-questions.ts:insertCookingQuestion, findCookingQuestion, setCookingAnswer, findAppliedChanges, lockCookingChain, hasPendingInChain, answeredBefore` – Въпрос в Готвене и веригата му.
- `ingredients.ts:searchIngredients, findIngredientByName, findIngredient, findIngredientsByIds, existingIngredientIds, insertIngredient, updateIngredient, listIngredientNames, listRegistryIngredients, ingredientColumns` – Продукти (регистърът на продуктите).
- `meal-replacements.ts:lockMeal, hasPendingReplacement, insertReplacement, findReplacement, findLatestReplacement, setReplacementCandidates` – заявки `meal.replace`.
- `menu-activity.ts:addMenuActivity, takeQuietMenuActivity, MenuActivityKind` – броячи за Известие от Съгласуването.
- `menu.ts:lockWeek, findPlanByWeek, findPlanSummary, listPlans, insertPlan, deletePlan, findMeal, findMealOn, updateMeal, swapMealDates` – Седмично меню и ястия.
- `menu.ts:upsertVote, deleteVote, deleteOtherVotes, listComments, findComment, insertComment, deleteComment` – Гласове и Разговор на ястие.
- `menu.ts:insertProposal, findProposal, listProposalsOfWeek, hasPendingProposal, setProposalPlan, markMealThawed, claimMealCook, saveRemoval, findRemoval, deleteRemoval` – Предложение за меню, „Извадих“, „Аз“ и „Върни“.
- `notification-log.ts:listNotificationLog, listNotifiedUsers, claimNotification` – дневник на изпратените напомняния.
- `notifications.ts:upsertPushSubscription, deleteUserPushSubscription, deletePushSubscription, listPushSubscriptions, markPushSubscriptionSucceeded, listNotificationSettings, upsertNotificationSettings` – устройства за Web Push и настройките за известия.
- `pantry.ts:listPantryItems, findPantryItem, insertPantryItem, updatePantryItem, deletePantryItem, setPantryRanOut, listUseUp, PANTRY_INGREDIENT_UNIQUE` – Килер.
- `recipe-imports.ts:insertImportRequest, findImportRequest, listImportRequests, setImportNoResults, findImportSource, setImportUrl, findSourceUrlMatches, insertImportedSuggestion, findImportedSuggestion` – Внасяне на рецепта.
- `recipe-refinements.ts:lockRecipe, hasPendingRefinement, insertRefineRequest, findRefineRequest, setRefinement, setRefineNoResults` – Подобряване на рецепта.
- `recipe-revisions.ts:findOpenRevisions, lockRecipeUpdatedAt, insertRevisionRequest, findRevisionRequest, findRevisionBaseRecipe, findOpenSuggestionRevision, lockRevisionRequest, setRevision, setRevisionNoResults, decideRevisionRequest` – Поправка на рецепта.
- `recipe-suggestions.ts:insertSuggestionRequest, findSuggestionRequest, listSuggestionRequests, insertSuggestions, listSuggestions, lockSuggestion, decideSuggestion, undecideSuggestion, toImportedSuggestion` – Заявка за предложения и Предложение за рецепта.
- `recipes.ts:findRecipe, listRecipes, insertRecipe, updateRecipe, setRecipeArchivedAt, setRecipeRating, replaceRecipeLines` – Регистър рецепти: рецепти, Компоненти и редове с продукти.
- `recipes.ts:listActiveRecipeTitles, listActiveRecipesByTitle, isMenuRecipe, listMenuRecipes, countMenuRecipes` – контекст на регистъра за AI контрактите и менюто.
- `reminders.ts:listReminderDinners, listFrozenIngredientIds` – вечерите и продуктите „Във фризера“, които трябват на напомнянията.
- `shopping.ts:ensureShoppingList, findShoppingListId, listShoppingItems, setComputedItemOverlay, insertManualItem, setManualItemCheck, deleteManualItem, listShoppingMealIds, insertShoppingMeal, deleteShoppingMeal, deleteShoppingMealsOf` – Списък за пазаруване.
- `step-photos.ts:insertStepPhoto, findStepPhotoData, existingStepPhotoIds, deleteOrphanStepPhotos` – Снимка на стъпка.
- `sync-runs.ts:startRun, finishRun, lastRuns, pruneRuns` – Синхронизация (`sync_run`).
- `users.ts:listUsers, listPeople, findUser` – Потребители; `listPeople` е без служебните (роля `app`, ADR-0014).
- Изнесени типове за вход и изход: `budget-snapshots.ts:NewBudgetSnapshot`, `calendar-events.ts:NewCalendarEvent`, `cooking-questions.ts:StoredCookingQuestion`, `menu-activity.ts:MenuActivity`, `menu.ts:NewMeal, MealRemoval`, `notification-log.ts:NotificationLogEntry`, `notifications.ts:StoredSubscription`, `recipe-imports.ts:ImportSource`, `reminders.ts:ReminderMeal`, `shopping.ts:ItemCheck`, `sync-runs.ts:SyncRun, LastRuns`.

## Invariants

- `menu.ts:lockWeek`, `cooking-questions.ts:lockCookingChain` – `pg_advisory_xact_lock` по седмица или по верига, за да важат проверките „няма план“, „няма чакащо предложение“ и „няма чакащ въпрос“ и в момента на вмъкването.
- `recipe-refinements.ts:lockRecipe`, `recipe-revisions.ts:lockRecipeUpdatedAt, lockRevisionRequest`, `recipe-suggestions.ts:lockSuggestion`, `meal-replacements.ts:lockMeal` – `SELECT … FOR UPDATE` до края на транзакцията. Така две решения или две чакащи заявки не могат да се изпреварят.
- `menu.ts:insertPlan, insertProposal`, `recipe-refinements.ts:insertRefineRequest`, `meal-replacements.ts:insertReplacement` – втори план за седмицата или втора чакаща заявка се отказват от уникалните индекси (`meal_plan_week_start_unique`, `menu_proposal_request_pending_week_key`, `recipe_refine_request_pending_recipe_key`, `meal_replace_request_pending_meal_key`).
- `menu.ts:swapMealDates` – `(plan_id, date, slot)` е уникален и не е deferrable. Затова ястието `a` първо се „паркира“ 100 години назад и чак тогава двете ястия си разменят дните.
- `calendar-events.ts:replaceSourceEvents` – изтриването в прозореца и вмъкването са в една транзакция; при конфликт по `(calendar_source_id, external_id)` редът се обновява.
- `calendar-sources.ts:upsertCalendarSources` – източник, който го няма в списъка, се изключва, а не се изтрива (кешът му остава). `kind` е `family`, когато `ownerUserId` е `null`.
- `notification-log.ts:claimNotification` – `onConflictDoNothing` по ключа на дневника. От две едновременни изпълнения напомнянето изпраща само едното.
- `menu-activity.ts:takeQuietMenuActivity` – един `DELETE … RETURNING`, за да не се загуби действие, дошло междувременно.
- `shopping.ts:setComputedItemOverlay` – записът на изчислен ред се изтрива, когато не му остане нито отметка, нито `hidden`. `ensureShoppingList` е безопасна при паралелни извиквания (`onConflictDoNothing`).
- `recipes.ts:setRecipeArchivedAt` пази по-ранна `archived_at`; `setRecipeRating` не мести `updated_at`; `replaceRecipeLines` трябва да се вика в транзакция.
- `recipe-revisions.ts:isOpen` – отворена е поправка `pending` или `done` с поправена рецепта и без решение. `recipe-revisions.ts:stale` – поправката е остаряла, когато рецептата е записана след `base_updated_at` (сравнение до милисекунда); връща се като поле `stale` на всяка поправка.
- `step-photos.ts:deleteOrphanStepPhotos` – трие само снимки, качени преди прага, към които не сочи стъпка на рецепта (и архивирана) или на предложение в състояние `proposed`.
- `sync-runs.ts:pruneRuns` – пази последния успешен `sync_run` на всеки източник.
- `ingredients.ts:findIngredientByName` – имената се сравняват като `lower(trim(name))`, както е в уникалния индекс `ingredient_name_key`.

## Side Effects

- Писане в Postgres (insert/update/delete/upsert) върху таблиците от `../schema`: `appliance`, `budget_snapshot`, `calendar_event`, `calendar_source`, `cooking_question_request`, `ingredient`, `meal*`, `menu_*`, `notification_*`, `push_subscription`, `pantry_item`, `recipe*`, `shopping_*`, `step_photo`, `sync_run`.
- `contract-requests.ts:finishContractRequest, failPendingContractRequestsBefore` – пишат в таблицата `*_request`, която подаде извикващият.
- Заключвания в Postgres: advisory locks (`menu.ts:lockWeek`, `cooking-questions.ts:lockCookingChain`) и row locks (`FOR UPDATE`, виж Invariants).
- `cooking-questions.ts:insertCookingQuestion`, `shopping.ts:insertManualItem` – генерират `id` с `node:crypto` `randomUUID` (ръчният ред получава `item_key` `manual:<id>`).

## Verification

- Run: `pnpm --filter api test` (за папката няма отделни specs; покрива се от specs в `src/routes` и `src/services`. Нужна е тестовата база: `docker compose -p family-test --profile test up -d postgres-test`)
