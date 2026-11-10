# db/schema

## Overview

Декларативната Drizzle схема на базата (`pgTable`). От нея `drizzle-kit generate` прави миграциите в `apps/api/drizzle` (`apps/api/drizzle.config.ts` сочи `./src/db/schema/index.ts`). Изброимите стойности са `text` колони с `CHECK` по стойностите на zod схемите от `packages/shared`. Изключения са `user_role` (истински Postgres enum) и таблиците в `dashboard.ts` (литерали, вписани на ръка). Всички таблици на AI заявки (AI заявка) споделят общите колони от `columns.ts`.

## Interface

- `index.ts` – реекспортира `appliance`, `dashboard`, `food`, `menu`, `notifications`, `pantry`, `shopping`, `source-photo`, `step-photo`, `user` (без `checks.ts` и `columns.ts`).
- `checks.ts:literals, oneOf` – SQL списък от фиксирани стойности и израз `col in (...)` за `CHECK`.
- `columns.ts:createdAt, contractRequestColumns` – `created_at` и общите колони на AI заявка: `id`, `hint`, `status` (по подразбиране `pending`), `error`, `requested_by` (`NOT NULL`, FK към `user`), `created_at`, `finished_at`.
- `user.ts:userRole, user` – enum `user_role` и таблица `user`.
- `appliance.ts:appliance` – `appliance`.
- `dashboard.ts:calendarSource, calendarEvent, budgetSnapshot, syncRun` – `calendar_source`, `calendar_event`, `budget_snapshot`, `sync_run`.
- `food.ts:ingredient, recipe, recipeComponent, recipeIngredient` – `ingredient`, `recipe`, `recipe_component`, `recipe_ingredient`.
- `food.ts:recipeSuggestionRequest, recipeImportRequest, recipeSuggestion, recipeRefineRequest, recipeRevisionRequest, cookingQuestionRequest` – `recipe_suggestion_request`, `recipe_import_request`, `recipe_suggestion`, `recipe_refine_request`, `recipe_revision_request`, `cooking_question_request`.
- `menu.ts:mealPlan, meal, mealVote, mealComment, mealRemoval, menuProposalRequest, mealReplaceRequest, menuReworkRequest` – `meal_plan`, `meal`, `meal_vote`, `meal_comment`, `meal_removal`, `menu_proposal_request`, `meal_replace_request`, `menu_rework_request`.
- `notifications.ts:pushSubscription, notificationSetting, notificationLog, menuActivity, inboxItem` – `push_subscription`, `notification_setting`, `notification_log`, `menu_activity`, `inbox_item` (Входяща кутия, ADR-0015).
- `pantry.ts:pantryItem` – `pantry_item`.
- `shopping.ts:shoppingList, shoppingItem, shoppingMeal` – `shopping_list`, `shopping_item`, `shopping_meal`.
- `step-photo.ts:stepPhoto, bytea` – `step_photo` (байтовете са `bytea` през `customType`).
- `source-photo.ts:sourcePhoto` – `source_photo`, снимките на източника на рецепта (ADR-0016); сочат към тях `recipe_import_request.photos` и `recipe.source_photos`.

## Invariants

- `checks.ts` – изброимите стойности са `text` с `CHECK` по стойностите от `packages/shared`, а не Postgres enum. Изключения: `user.ts:userRole` (Postgres enum); `dashboard.ts:calendarSource` (`kind`) и `dashboard.ts:syncRun` (`source`, `status`) с `CHECK` по вписани на ръка литерали; `calendar_source.color_token` е без `CHECK`.
- `appliance.ts:appliance` – уникален `appliance_name_unique` по `lower(name)`. `food.ts:ingredient` – уникален `ingredient_name_key` по `lower(trim(name))` и `CHECK` за единица и щанд.
- `food.ts:recipe` – `servings >= 1`, `rating` между 1 и 5, таговете са подмножество на позволените. При `recipe_component` името е с дължина от 1 до `COMPONENT_NAME_MAX`, а `servings >= 1`. Двойката `(recipe_id, position)` е уникална в `recipe_component` и в `recipe_ingredient`.
- `food.ts:recipeIngredient` – `unit <> 'pinch' or quantity is null`; `ingredient_id` е FK с `onDelete restrict`.
- `food.ts:recipeSuggestion` – `num_nonnulls(request_id, import_request_id) = 1`; уникален `(request_id, position)`; уникален `import_request_id` (едно предложение на внасяне).
- `food.ts:recipeRevisionRequest` – `num_nonnulls(recipe_id, suggestion_id) = 1`; `decision` е с `CHECK` по стойностите на решението.
- `requested_by` е nullable (презаписва колоната от `columns.ts`) в `food.ts:recipeRevisionRequest` и `food.ts:cookingQuestionRequest` (kiosk) и в `menu.ts:menuProposalRequest` (cron).
- `food.ts:recipeSuggestionRequest` – `slots` не е празен (`cardinality > 0`) и е подмножество на позволените слотове. `food.ts:cookingQuestionRequest` – `follows_id` сочи предишния въпрос с `onDelete set null`.
- Частични уникални индекси `WHERE status = 'pending'`: `recipe_refine_request(recipe_id)`, `cooking_question_request(chain_id)`, `menu_proposal_request(week_start)`, `meal_replace_request(meal_id)`, `menu_rework_request(plan_id)` – най-много една чакаща заявка на предмет.
- `menu.ts:meal` – уникален `(plan_id, date, slot)`. FK към рецептата е `restrict`: рецепта в план се архивира, не се трие. `meal_plan.week_start` е уникален. `menu.ts:mealRemoval` – PK `meal_id` (най-много едно „Извадих“ на ястие); `comment_id` е `set null`.
- `menu.ts:menuProposalRequest` – `trigger <> 'user' or requested_by is not null`. `menu.ts:mealComment` – колоната `seq` (identity) разрешава равенства при подреждане по `(meal_id, created_at, seq)`. `notifications.ts:menuActivity` – `seq` (identity) е ключът и редът на действията.
- `pantry.ts:pantryItem` – по един ред на продукт (`ingredient_id` е уникален, FK с `cascade`); `ran_out_at is null or kind = 'staple'`.
- `shopping.ts:shoppingItem` – уникален `(list_id, item_key)`; `shopping_list.week_start` и `plan_id` са уникални. `plan_id` в `shopping_list` и в `menu_proposal_request` е `set null` при изтрит план.
- Съставни първични ключове: `notification_log(kind, subject_id, on_date, user_id)` (напомняне не се праща два пъти), `notification_setting(user_id, kind)`, `shopping_meal(list_id, meal_id)`, `meal_vote(meal_id, user_id)`.
- `notifications.ts:pushSubscription` – уникален `endpoint`. `notifications.ts:inboxItem` – уникален `(user_id, tag)`: известие със същия `tag` обновява реда; `details` е jsonb `{ text, url? }[]`, по подразбиране `[]`; `actions`/`action_until` са бутоните на въпроса и до кога имат смисъл. `menu.ts:meal.thawed_by_user_id` – кой е натиснал „Извадих“ (`set null`), отпада с `thawed_at`. `dashboard.ts:calendarEvent` – уникален `(calendar_source_id, external_id)`. `dashboard.ts:calendarSource` – уникален `google_calendar_id`.
- Промяна тук изисква нова миграция (`pnpm --filter api db:generate`) в `../../../drizzle`.

## Side Effects

- None (само декларации; поведението, описано в коментарите, живее в `src/services` и `src/db/repositories`).

## Verification

- Run: `pnpm --filter api typecheck` и `pnpm --filter api test` (с тестовата база: `docker compose -p family-test --profile test up -d postgres-test`)
