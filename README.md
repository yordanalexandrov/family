# Семейна платформа

Едно споделено място за семейството: календар, бюджет и храна на един екран. Концепцията е в [docs/concept.md](docs/concept.md), правилата за промени в [docs/conventions.md](docs/conventions.md), структурата на репото в [docs/architecture.md](docs/architecture.md).

## Локално

Нужни са Node 24 (`.nvmrc`) и pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm dev                 # api на http://127.0.0.1:18091 (tsx watch) и web на http://localhost:5173 (Vite, proxy /api → api)
pnpm --filter api dev    # само api: curl 127.0.0.1:18091/healthz
pnpm --filter web dev    # само web
pnpm lint && pnpm typecheck && pnpm test && pnpm build   # същите проверки като в CI (.github/workflows/ci.yml)
```
