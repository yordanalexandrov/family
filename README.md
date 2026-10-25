# Семейна платформа

Едно споделено място за семейството: календар, бюджет и храна на един екран. Концепцията е в [docs/concept.md](docs/concept.md), правилата за промени в [docs/conventions.md](docs/conventions.md), структурата на репото в [docs/architecture.md](docs/architecture.md).

## Локално

Нужни са Node 24 (`.nvmrc`) и pnpm 10 (`corepack enable`).

```bash
pnpm install
cp .env.example .env     # попълни POSTGRES_PASSWORD и DATABASE_URL; api чете .env от корена
docker compose up -d postgres                        # Postgres 17 на 127.0.0.1:5432, данните са в volume pgdata
pnpm dev                 # api на http://127.0.0.1:18091 (tsx watch, прилага миграциите при старт) и web на http://localhost:5173 (Vite, proxy /api → api)
pnpm --filter api dev    # само api: curl 127.0.0.1:18091/healthz → {"status":"ok","db":"ok"}
pnpm --filter web dev    # само web
docker compose --profile test up -d postgres-test    # тестова база на 127.0.0.1:5433 (tmpfs), нужна за pnpm test
pnpm lint && pnpm typecheck && pnpm test && pnpm build   # същите проверки като в CI (.github/workflows/ci.yml)
pnpm --filter api db:generate                        # нова миграция след промяна на Drizzle схемата (apps/api/src/db/schema)
```

## Deploy

Merge в `master` стига до `homesrv` сам: [deploy.yml](.github/workflows/deploy.yml) тръгва на self-hosted runner-а `homesrv-family` и в checkout-а си:

1. пише `.env` от secrets на GitHub Environment `production` и спира, ако някой липсва;
2. `docker compose -p family up -d --build --remove-orphans`: пресъздава само контейнерите с нов образ или нова конфигурация (и `backup`, ако `infra/backup/backup.sh` е сменен); данните са във volume `pgdata` и остават;
3. smoke тест през Caddy: до 60 s `http://127.0.0.1:18090/healthz` трябва да върне `"db":"ok"`, а `/` — `index.html`. Иначе run-ът е червен, а в лога му са `docker compose ps -a` и последните 100 реда на `api`.

Deploy-ите вървят един по един (`concurrency: deploy-production`). Runner-ът, Environment-ът и branch protection са описани в [infra/README.md](infra/README.md#github).

- **Ръчно:** Actions → deploy → Run workflow на `master` (`workflow_dispatch`) или `gh workflow run deploy.yml --ref master`. Deploy-ва отново върха на `master`, например след смяна на secret; за друг клон job-ът се пропуска.
- **Логове:** на `homesrv` `docker compose -p family logs -f api` (или `caddy`, `postgres`, `backup`), състоянието с `docker compose -p family ps`. Логът на самия deploy е в Actions и е публичен като repo-то, затова в него не се печатат secrets.
- **Назад:** `git revert` на commit-а в PR + merge, и deploy-ът на revert-а връща предишното състояние. `workflow_dispatch` пуска само върха на клон, не стар commit; re-run на стар успешен run връща кода, но `master` остава на счупения commit и следващият merge го deploy-ва пак. Миграция не се връща с revert: промяната в схемата остава и се оправя с нова миграция.
