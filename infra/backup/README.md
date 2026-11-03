# backup

## Overview

Скриптът на service `backup` от [docker-compose.yml](../../docker-compose.yml): образ `postgres:17-alpine` (busybox `sh`), монтиран read-only като `/usr/local/bin/backup.sh`. Всяка нощ в 03:00 местно време (`TZ`) прави `pg_dump` на базата и трие dump-овете на 15 или повече дни (около 15 файла остават). Ръчният backup и възстановяването са описани в [infra/README.md](../README.md#backup-и-възстановяване).

## Interface

- `backup.sh` — entrypoint на контейнера; без аргументи чака 03:00 в безкраен цикъл.
- `backup.sh:BACKUP_RUN_NOW` — `BACKUP_RUN_NOW=1` прави един dump веднага и излиза: `docker compose -p family run --rm -e BACKUP_RUN_NOW=1 backup`.
- `backup.sh:backup` — пише `/backups/family-YYYY-MM-DD.dump` (`pg_dump -Fc`, за `pg_restore`); връща 1 при неуспешен `pg_dump`.
- `backup.sh:next_run` — epoch секундите на следващия `$at` (`03:00`) в местно време.
- Входни променливи: `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` (libpq), `TZ`; стойностите идват от `docker-compose.yml` и `.env`.

## Invariants

- `backup.sh:backup` — dump-ът се пише като `$file.partial` и се преименува чак след успешен `pg_dump`, така че файл `family-*.dump` никога не е непълен; при неуспех `.partial` се трие и старите dump-ове остават.
- `backup.sh:backup` — трият се само `family-*.dump` с `find -mtime +$keep_days` (`keep_days=14`), и само след успешен нов dump. `-mtime +14` значи възраст в цели 24-часови периоди строго над 14, т.е. файл на 15 или повече дни; dump-овете на възраст 0–14 дни остават (около 15 файла).
- `backup.sh:umask 077` — dump-овете са достъпни само за собственика (root), защото държат данните на семейството.
- `backup.sh:next_run` — утрешната дата се смята от днешното пладне + 24 h, за да е вярна и в ден с 23 или 25 часа (смяна на часовото време).
- `backup.sh:trap 'exit 0' TERM INT` — `sleep` върви във фона и `wait`, за да може `docker compose stop` да спре контейнера веднага (shell-ът като PID 1 иначе игнорира SIGTERM).

## Side Effects

- `backup.sh:backup` — мрежова връзка към `postgres` през `pg_dump`.
- `backup.sh:backup` — пише и трие файлове в `/backups` (на `homesrv` монтиран от `/srv/family/backups`).
- `backup.sh:log` — по ред в stdout на контейнера за всеки dump и следващото пускане.

## Verification

- Няма автоматичен тест. Ръчно: `docker compose -p family run --rm -e BACKUP_RUN_NOW=1 backup` и проверка, че в лога има `wrote /backups/family-…dump`.
