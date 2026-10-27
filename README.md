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
docker compose -p family-test --profile test up -d postgres-test    # тестова база на 127.0.0.1:5433 (tmpfs), нужна за pnpm test
pnpm lint && pnpm typecheck && pnpm test && pnpm build   # същите проверки като в CI (.github/workflows/ci.yml)
pnpm --filter api db:generate                        # нова миграция след промяна на Drizzle схемата (apps/api/src/db/schema)
```

## Smoke тест на `recipe.suggest`

Ръчна проверка срещу реалния агент `family-recipe` на `homesrv` (не е част от `pnpm test`; струва токени и търсения). Нужно е Provisioning-ът да е направен: включен `chatCompletions` в gateway-а, агентът с prompt-а от [docs/openclaw/family-recipe.md](docs/openclaw/family-recipe.md) и ключ за търсене. Gateway-ът слуша само на loopback на `homesrv`, затова локално се минава през ssh тунел:

```bash
ssh -N -L 18789:127.0.0.1:18789 homesrv &                # тунел; спира се с kill %1 накрая
read -rs OPENCLAW_GATEWAY_PASSWORD && export OPENCLAW_GATEWAY_PASSWORD   # постави gateway.auth.password от ~/.openclaw/openclaw.json на homesrv; не се показва и не остава в history
pnpm --filter api suggest:smoke -- --slots breakfast
pnpm --filter api suggest:smoke -- --slots lunch,dinner --times 0-15,15-30 --tags batch
pnpm --filter api suggest:smoke -- --slots dinner --hint "нещо с пиле" --save /tmp/recipe-suggest.dinner.json
```

Скриптът (`apps/api/scripts/suggest-smoke.ts`) чете `OPENCLAW_*` от средата или от `.env` в корена (`OPENCLAW_URL` по подразбиране е `http://127.0.0.1:18789`), праща входа на контракта със seed продуктите като `ingredientNames` и празен регистър, и печата за всяко предложение заглавие, URL, „защо“, брой продукти и колко са `isNew`, а накрая общата продължителност. Логовете на клиента (опит, продължителност, `usage`) са на stderr; паролата не се печата никъде. Изход 1 = таймаут, HTTP грешка или два невалидни отговора; `--save` записва валидирания JSON, напр. за да замени ръчната фикстура `packages/shared/src/contracts/fixtures/recipe-suggest.valid.json`. Изходът за PR коментар се копира без първия ред от лога на тунела и без нищо от средата. Преди merge същият скрипт върви срещу копието `family-recipe-next` с `OPENCLAW_RECIPE_AGENT=family-recipe-next` ([docs/openclaw/README.md → Smoke преди merge](docs/openclaw/README.md#smoke-преди-merge)); за `menu.propose` е `OPENCLAW_MENU_AGENT=family-menu-next`.

## Smoke тест на `menu.propose`

Ръчна проверка срещу реалния агент `family-menu` на `homesrv` (не е част от `pnpm test`). Нужен е агентът с prompt-а от [docs/openclaw/family-menu.md](docs/openclaw/family-menu.md), без инструменти; тунелът и паролата са като при `recipe.suggest` отгоре:

```bash
pnpm --filter api menu:smoke
pnpm --filter api menu:smoke -- --hint "без месо в петък" --save /tmp/menu-propose.json
```

Скриптът (`apps/api/scripts/menu-smoke.ts`) праща входа от фикстурата `packages/shared/src/contracts/fixtures/menu-propose.input.json` (10 вечери, 2 от последните седмици, подсказката от фикстурата или `--hint`), валидира отговора като api-то (Zod + `validateProposal`, един повторен опит) и печата седемте вечери със заглавие, време, тагове и „защо“, отбелязва повторените от последните 2 седмици, после обобщението и продължителността. Изход 1 = таймаут, HTTP грешка или два невалидни отговора; `--save` записва валидирания JSON, за да замени ръчната фикстура `menu-propose.valid.json` (id-тата съвпадат, защото входът е същият).

## Deploy

Merge в `master` стига до `homesrv` сам: [deploy.yml](.github/workflows/deploy.yml) тръгва на self-hosted runner-а `homesrv-family` и в checkout-а си:

1. пише `.env` от secrets на GitHub Environment `production` и спира, ако някой липсва;
2. `docker compose -p family up -d --build --remove-orphans`: пресъздава само контейнерите с нов образ или нова конфигурация (и `backup`, ако `infra/backup/backup.sh` е сменен); данните са във volume `pgdata` и остават;
3. smoke тест през Caddy: до 60 s `http://127.0.0.1:18090/healthz` трябва да върне `"db":"ok"`, а `/` — `index.html`. Иначе run-ът е червен, а в лога му са `docker compose ps -a` и последните 100 реда на `api`.

Deploy-ите вървят един по един (`concurrency: deploy-production`). Runner-ът, Environment-ът и branch protection са описани в [infra/README.md](infra/README.md#github).

- **Ръчно:** Actions → deploy → Run workflow на `master` (`workflow_dispatch`) или `gh workflow run deploy.yml --ref master`. Deploy-ва отново върха на `master`, например след смяна на secret; за друг клон job-ът се пропуска.
- **Логове:** на `homesrv` `docker compose -p family logs -f api` (или `caddy`, `postgres`, `backup`), състоянието с `docker compose -p family ps`. Логът на самия deploy е в Actions и е публичен като repo-то, затова в него не се печатат secrets.
- **Проверка след deploy:** в лога на стъпката Deploy `family-postgres-1` трябва да е `Running`, не `Recreate`, тоест базата не е рестартирана. На `homesrv` `docker inspect -f '{{.State.StartedAt}}' family-postgres-1` показва кога е стартирала.
- **Назад:** `git revert` на commit-а в PR + merge, и deploy-ът на revert-а връща предишното състояние. `workflow_dispatch` пуска само върха на клон, не стар commit; re-run на стар успешен run връща кода, но `master` остава на счупения commit и следващият merge го deploy-ва пак. Миграция не се връща с revert: промяната в схемата остава и се оправя с нова миграция.
