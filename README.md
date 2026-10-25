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
