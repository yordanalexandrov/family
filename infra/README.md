# Инфраструктура

Стекът на `homesrv` е [docker-compose.yml](../docker-compose.yml) с образи от [Dockerfile](../Dockerfile): `docker compose -p family up -d --build` от корена, с `.env` до него. Мрежата е по [ADR-0005](../docs/adr/0005-api-and-caddy-on-host-network.md), общата картина е в [architecture.md](../docs/architecture.md#инфраструктура).

| Порт | Service | Бележка |
|---|---|---|
| `127.0.0.1:18090` | `caddy` (host мрежа) | входът: cloudflared → `http://localhost:18090`; статика, `/api/*` и `/healthz` → api |
| `127.0.0.1:18091` | `api` (host мрежа) | прилага миграциите при старт |
| `127.0.0.1:5432` | `postgres` (bridge) | volume `pgdata`; `backup` го стига като `postgres` |
| `127.0.0.1:5433` | `postgres-test` (профил `test`) | само за `pnpm test` |

## Пълният стек локално

```bash
cp .env.example .env              # dev стойности за POSTGRES_PASSWORD и DATABASE_URL
cp docker-compose.override.yml.example docker-compose.override.yml   # AUTH_MODE=dev; backup във volume, не в /srv/family/backups
docker compose -p family up -d --build
curl 127.0.0.1:18090/healthz      # {"status":"ok","db":"ok"}
curl -H 'X-Acting-User: 11111111-1111-4111-8111-111111111111' 127.0.0.1:18090/api/me   # Дани
docker compose -p family down     # данните остават във volume pgdata; `down -v` ги трие
```

Override-ът е в `.gitignore`. Без него api тръгва с `AUTH_MODE=cloudflare` и чете `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` и `ALLOWED_EMAILS` от `.env`.

## Backup и възстановяване

`backup` прави `pg_dump -Fc` всяка нощ в 03:00 (`TZ`) във `/srv/family/backups/family-YYYY-MM-DD.dump` и трие dump-овете по-стари от 14 дни. Файловете са достъпни само за root.

```bash
docker compose -p family run --rm -e BACKUP_RUN_NOW=1 backup    # dump веднага, без да чака 03:00
docker compose -p family stop api                               # никой не пише по време на restore
docker compose -p family run --rm --entrypoint pg_restore backup \
  --clean --if-exists --single-transaction -d family /backups/family-YYYY-MM-DD.dump
docker compose -p family start api
```

## GitHub

Настройките в GitHub се правят на ръка в Provisioning билета [#11](https://github.com/yordanalexandrov/family/issues/11); тук е какво трябва да има, за да се провери. Repo-то е публично ([AGENTS.md → Public repo](../AGENTS.md#public-repo)), затова self-hosted runner-ът е само за [deploy.yml](../.github/workflows/deploy.yml), който тръгва от push в `master` и `workflow_dispatch`, никога от PR.

| Settings → | Какво |
|---|---|
| Rules → Rulesets | Ruleset за `master` (Enforcement status: Active): *Require a pull request before merging* (0 одобрения: авторът не може да одобри свой PR), *Require status checks to pass* с check `ci` и *Require branches to be up to date before merging*, *Block force pushes*. |
| Actions → General | *Approval for running fork pull request workflows from contributors*: *Require approval for all external contributors* (по-рано „outside collaborators“). |
| Environments → `production` | Secrets `POSTGRES_PASSWORD`, `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `ALLOWED_EMAILS`; стойностите са само там. *Deployment branches and tags*: само `master`. |
| Actions → Runners | `homesrv-family` на `homesrv`, процесът е в група `docker`. Labels: `self-hosted`, `Linux`, `X64` + `family`, `homesrv`; `deploy.yml` го иска с `runs-on: [self-hosted, linux, family]`. |

Одобрението на PR от fork е истинската защита: такъв PR може да смени всеки workflow, вкл. `runs-on`, и без одобрение job-ът му би пуснал чужд код на `homesrv` с правата на групата `docker` (на практика root). Стъпката в `ci.yml` ([check-workflows.sh](../.github/scripts/check-workflows.sh)) хваща само грешка в repo-то, защото PR може да промени и нея.

Checkout-ът на сървъра, с `.env` до него, е workspace-ът на runner-а `~/actions-runner-family/_work/family/family`; командите за backup и restore по-горе се пускат оттам. `.env` се пише наново при всеки deploy. `POSTGRES_PASSWORD` важи само при първото създаване на volume `pgdata`: смяна на secret-а иска и `ALTER USER family PASSWORD '…'` в базата, преди deploy.
