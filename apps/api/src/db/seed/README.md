# db/seed

## Overview

Данните и помощните функции за seed миграциите на Продуктите. `ingredients.json` е изходният списък (обект с масив `aisles` от `{ key, labelBg, order }` и списъка с продукти). `ingredients.ts` прави от него идемпотентен `INSERT`. `migrations.ts` чете журнала на Drizzle, за да намери seed и data миграциите. Генераторът е `apps/api/scripts/seed-ingredients.ts`.

## Interface

- `ingredients.ts:ingredientSeedSql` – SQL за `INSERT INTO "ingredient" (name, unit, aisle) ... ON CONFLICT DO NOTHING`, с екранирани единични кавички.
- `ingredients.ts:seededIngredientNames` – имената, вмъкнати от такъв SQL, по реда им.
- `migrations.ts:SeedMigration, migrationPath` – `{ tag, path }` и абсолютният път до `drizzle/<tag>.sql`.
- `migrations.ts:ingredientSeedMigrations` – таговете от журнала по `/^\d{4}_seed_ingredients(_\w+)?$/`, по реда в журнала.
- `migrations.ts:dataMigrations` – таговете по `/^\d{4}_seed_\w+$/`.
- `migrations.ts:isEmptyMigration` – дали SQL съдържа само празни редове и `--` коментари.
- `ingredients.json` – данните на seed (тип `CreateIngredient` от `packages/shared`).

## Invariants

- `ingredients.ts` (коментар в началото) – приложена миграция е замразена. Нови продукти влизат в НОВА seed миграция; генераторът отказва миграция, която вече има SQL.
- `ingredients.ts:ingredientSeedSql` – идемпотентен по каноничното име (`ON CONFLICT DO NOTHING`); генерираният SQL е маркиран „do not edit by hand“.
- `migrations.ts:DATA_MIGRATION_TAG` (коментар) – data миграциите са идемпотентни, затова specs ги пускат отново след всеки тест.
- `migrations.ts` – редът на миграциите е редът на записите в `drizzle/meta/_journal.json`.

## Side Effects

- `migrations.ts:journalTags` – чете `drizzle/meta/_journal.json` от диска.
- `ingredients.ts` – None (чисти функции върху низове).

## Verification

- Run: `pnpm --filter api test src/db/seed` (нужна е тестовата база: `docker compose -p family-test --profile test up -d postgres-test`)
