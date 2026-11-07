# drizzle

## Overview

SQL миграциите на базата (41 файла, `0000_users.sql` … `0040_seed_app_user.sql`), генерирани от `drizzle-kit generate` по `src/db/schema`. Има и custom data миграции, писани на ръка. API-то ги прилага при старт (`src/db/migrate.ts:runMigrations`) по реда на журнала `meta/_journal.json`. `meta/` е служебна папка на drizzle-kit (snapshots и журнал).

## Interface

- DDL таблици (`CREATE TABLE`): `user`, `appliance`, `calendar_source`, `calendar_event`, `budget_snapshot`, `sync_run`, `ingredient`, `recipe`, `recipe_component`, `recipe_ingredient`, `recipe_suggestion_request`, `recipe_suggestion`, `recipe_import_request`, `recipe_refine_request`, `recipe_revision_request`, `cooking_question_request`, `meal_plan`, `meal`, `meal_vote`, `meal_comment`, `meal_removal`, `menu_proposal_request`, `meal_replace_request`, `menu_activity`, `shopping_list`, `shopping_item`, `shopping_meal`, `pantry_item`, `push_subscription`, `notification_setting`, `notification_log`, `step_photo`.
- Тип: `CREATE TYPE "public"."user_role" AS ENUM` (`0000_users.sql`; `0039_user_role_app.sql` го прави наново със стойност `app`, защото Drizzle прилага миграциите в една транзакция, а `ADD VALUE` не се ползва преди commit).
- Уникални индекси: `appliance_name_unique`, `ingredient_name_key`, `meal_plan_date_slot_key`, `recipe_component_position_key`, `recipe_ingredient_position_key`, `recipe_suggestion_position_key`, `recipe_suggestion_import_request_key`, `shopping_item_list_key`. Частични за чакащи заявки: `cooking_question_request_pending_chain_key`, `meal_replace_request_pending_meal_key`, `menu_proposal_request_pending_week_key`, `recipe_refine_request_pending_recipe_key`. UNIQUE constraint-и: `calendar_source_google_calendar_id_unique`, `calendar_event_source_external_id_unique` (`0004`), `meal_plan_week_start_unique` (`0005`), `shopping_list_plan_id_unique` (`0006`), `shopping_list_week_start_unique` (`0021`), `pantry_item_ingredient_id_unique` (`0013`), `push_subscription_endpoint_unique` (`0015`).
- Data миграции:
  - `0001_seed_users.sql` – двамата членове на семейството с фиксирани UUID.
  - `0003_seed_ingredients.sql` – Продуктите от `src/db/seed/ingredients.json`, генерирани с `db:seed-ingredients`.
  - `0023_seed_appliances.sql` – Уредите, които преди #176 бяха константата `APPLIANCES` в `packages/shared`.
  - `0040_seed_app_user.sql` – служебният потребител Рецептурко (роля `app`, ADR-0014) с фиксиран UUID.
- Преобразуващи миграции:
  - `0007_suggestion_slots_times.sql` – един слот става списък.
  - `0020_shopping_item_per_ingredient.sql` – по един изчислен ред на продукт.
  - `0021_shopping_list_by_week.sql` – списъкът е по седмица; `plan_id` става nullable с FK `ON DELETE set null` (изтрито меню оставя списъка си).
  - `0025_recipe_step_object.sql` – стъпката става обект `{ text, photoId }`.
  - `0030_cooking_question_follows.sql` – `chain_id` = `id`.
  - `0033_shopping_meal_listed.sql` – ястията на минали седмици влизат в списъка им.

## Invariants

- `0003_seed_ingredients.sql` (коментар) – генериран е, не се редактира на ръка; идемпотентен е по каноничното име. Приложена миграция не се пренаписва: новите продукти влизат в нова миграция (`src/db/seed/ingredients.ts`).
- `0001_seed_users.sql`, `0003_seed_ingredients.sql`, `0023_seed_appliances.sql`, `0040_seed_app_user.sql` – идемпотентни (`ON CONFLICT DO NOTHING`), защото specs пускат отново всяка `<n>_seed_*` миграция (`src/db/seed/migrations.ts:dataMigrations`, `DATA_MIGRATION_TAG`).
- `0033_shopping_meal_listed.sql` (коментар) – също `ON CONFLICT DO NOTHING`, за да може да мине отново над вече добавени редове; specs не я пускат отново.
- `0012_menu_proposal_trigger.sql` – `CHECK` `trigger in ('user', 'schedule')` и `trigger <> 'user' or requested_by is not null`.
- `0014_recipe_rating.sql` – `CHECK` `rating between 1 and 5`.
- По-важни `CHECK`-ове: `recipe_suggestion_request_check` (`num_nonnulls(request_id, import_request_id) = 1`, `0019`), `recipe_revision_request_target_check` (`num_nonnulls(recipe_id, suggestion_id) = 1`, `0035`), `pantry_item_ran_out_check` (`ran_out_at` само за `staple`, `0013`), `recipe_ingredient_pinch_check` (`pinch` е без количество, `0002`), `recipe_servings_check` и `recipe_component_servings_check` (`>= 1`), `recipe_component_name_check` (1–40 знака, `0037`). Останалите `*_check` ограничават enum стойностите (status, kind, slot, unit, aisle, tags, times).
- Промените в схемата се правят в `src/db/schema`, след което се генерират с `pnpm --filter api db:generate`. Data миграции се правят с `db:generate --custom`.

## Side Effects

- Прилагането им (`src/db/migrate.ts:runMigrations` при старт на `src/server.ts`, или `pnpm --filter api db:migrate`) променя схемата и данните в Postgres на `DATABASE_URL`.

## Verification

- Run: `pnpm --filter api test src/db` (`src/db/migrate.spec.ts` и `src/db/seed` пазят миграциите и seed в синхрон; нужна е тестовата база: `docker compose -p family-test --profile test up -d postgres-test`)
