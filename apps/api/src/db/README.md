# db

## Overview

Връзката с Postgres и прилагането на миграциите. `client.ts` обвива `pg` `Pool` в Drizzle. `migrate.ts` прилага миграциите от `apps/api/drizzle` преди API-то да започне да приема заявки (вика се от `src/server.ts`). Подпапките съдържат схемата, слоя за достъп до данните и seed данните.

## Interface

- `client.ts:Db, DbExecutor` – Drizzle база с `$client: Pool`; `DbExecutor` е пулът или транзакция.
- `client.ts:createDb` – създава `Pool` (`connectionTimeoutMillis` 5000) в Drizzle и по избор закача `onPoolError`.
- `client.ts:closeDb, pingDb` – затваря пула; `select 1` (отхвърля, когато базата е недостъпна).
- `errors.ts:isUniqueViolation` – дали грешка (по веригата `cause`) е SQLSTATE `23505` за даденото ограничение.
- `like.ts:escapeLike, likePattern` – екранира `\`, `%`, `_` и прави `%…%` за `ilike`.
- `migrate.ts:runMigrations, RunMigrationsOptions` – прилага миграциите с повторни опити при грешка на връзката.
- Подпапки:
  - [schema](./schema/README.md) – Drizzle таблиците, ограниченията и индексите.
  - [repositories](./repositories/README.md) – функциите за четене и писане по таблици.
  - [seed](./seed/README.md) – seed данните на Продуктите и помощните функции за data миграциите.

## Invariants

- `client.ts:createDb` (коментар) – без `onPoolError` грешка на неактивна връзка срива процеса.
- `errors.ts:isUniqueViolation` – вярно е само ако първата грешка с код `23505` по веригата е за точно даденото ограничение.
- `migrate.ts:runMigrations` – повтаря само при грешки на връзката (`ECONNREFUSED`, `ECONNRESET`, `ENOTFOUND`, `EAI_AGAIN`, `ETIMEDOUT`, `EHOSTUNREACH`, `ENETUNREACH`, `57P03`, клас `08`); всяка друга грешка се хвърля веднага.
- `migrate.ts:runMigrations` – спира след крайния срок (по подразбиране 30 s, интервал 1 s).
- `migrate.ts:MIGRATIONS_FOLDER` – сочи `apps/api/drizzle` и от `src/`, и от `dist/`.

## Side Effects

- `client.ts:createDb` – отваря пул от мрежови връзки към `DATABASE_URL`; само ако е подаден `onPoolError`, го закача като слушател за `error` на пула.
- `client.ts:closeDb` – затваря пула; `client.ts:pingDb` – заявка към базата.
- `migrate.ts:runMigrations` – чете SQL файловете от диска и променя схемата на базата (`drizzle migrate`); изчаква с `setTimeout` между опитите и логва.

## Verification

- Run: `pnpm --filter api test src/db` (нужна е тестовата база: `docker compose -p family-test --profile test up -d postgres-test`)
