# Проучване: Cloudflare Access JWT във Fastify, нов hostname в cloudflared, runner за новото repo

Отговор на issue #4. Три части: (1) валидация на Cloudflare Access JWT във Fastify и конфигурация на Access приложение с one-time PIN; (2) какво точно върви на `homesrv` като cloudflared и как се добавя нов hostname; (3) регистриране на self-hosted GitHub Actions runner за `yordanalexandrov/family` и как deploy job-ът стига до Docker на хоста.

Фактите за сървъра са от read-only инспекция на `yordan@192.168.0.69` (2026-10-25); нищо не е променяно. Останалото е от първични източници (Cloudflare docs, `jose`, Fastify, Podman, GitHub docs) — линк при всяко твърдение. Непотвърдени неща са маркирани с **НЕПОТВЪРДЕНО**.

## TL;DR

| Въпрос | Отговор |
|---|---|
| Как валидираме Access | `onRequest` hook във Fastify: взима `cf-access-jwt-assertion`, `jose.jwtVerify` срещу `createRemoteJWKSet(https://<team>.cloudflareaccess.com/cdn-cgi/access/certs)` с `issuer` + `audience` (AUD tag); при липса/невалиден токен → `401`; `payload.email` става `request.user`. |
| Access приложение | Self-hosted app за `<име>.yo-po.eu`, IdP = One-time PIN, една Allow политика с Include → Emails = двата адреса. Access е deny-by-default. |
| cloudflared на homesrv | **Token-based (remotely managed)**: `podman run --network host ... tunnel --no-autoupdate run --token <…>`, `/srv/cloudflared` е празна, няма `config.yml`. Ingress се управлява от Cloudflare dashboard. `ai.yo-po.eu → http://localhost:18789`, `jellyfin.yo-po.eu → http://127.0.0.1:8096`. |
| Нов hostname | Само в dashboard: Networking → Tunnels → тунелът → Routes → Add route → Published application → `<име>` / `yo-po.eu` / `http://localhost:<Caddy порт>`. Нищо не се пипа на сървъра — `--network host` вече дава достъп до loopback. |
| Runner | Трите runner-а (`homesrv`, `homesrv-2`, `homesrv-3`) са регистрирани към `yordanalexandrov/emerald`. Няма runner на ниво личен акаунт — само repo/org/enterprise. Нужна е нова runner директория (`~/actions-runner-family`), регистрирана с `config.sh --url https://github.com/yordanalexandrov/family`. |
| Docker от job | `yordan` е в група `docker`; `/var/run/docker.sock` е `root:docker`. Job-ът пуска `docker compose up -d --build` директно; `.env` се пише от `${{ secrets.* }}`. |

---

## 1. Cloudflare Access JWT във Fastify

### 1.1 Какво идва от Cloudflare

Източник: [Validate JWTs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/) и [Application token](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/).

- Заявките, минали през Access, носят токена като header **`Cf-Access-Jwt-Assertion`**; браузърните заявки го носят и като cookie **`CF_Authorization`**. За API-то четем header-а (Node нормализира имената към lowercase → `request.headers['cf-access-jwt-assertion']`, [Node http docs](https://nodejs.org/api/http.html#messageheaders)).
- Публичните ключове са на **`https://<team-name>.cloudflareaccess.com/cdn-cgi/access/certs`** (JWKS). Алгоритъм **RS256**, ключова двойка уникална за акаунта; `kid` в header-а на токена сочи кой ключ.
- **AUD tag**: Zero Trust → Access controls → Applications → Configure (приложението) → Additional settings → *Application Audience (AUD) Tag*. Това е стойността на `aud`.
- Claims в payload-а: `aud` (AUD tag), **`email`** („verified by the identity provider“), `exp`, `iat`, `nbf`, **`iss`** („The Cloudflare Access domain URL for the application“ = `https://<team-name>.cloudflareaccess.com`), `type` (`app` или `org`), `sub` (стабилен ID на потребителя в акаунта), `identity_nonce`, `country`.
- **Ротация на ключовете**: „By default, Access rotates the signing key every 6 weeks“; „Previous keys remain valid for 7 days after rotation“. Cloudflare изрично съветва: „Validate tokens using the external endpoint rather than saving the public key as a hard-coded value.“ Конкретен TTL за кеш не е даден.
- Защо валидираме на origin-а, щом сме зад Access: Access спира трафика на ниво hostname; ако origin-ът е достижим по друг път, Access се заобикаля. Нашият origin е само зад Tunnel (няма публичен IP), но валидацията на JWT е втората линия и ни дава имейла на потребителя ([Cloudflare blog](https://blog.cloudflare.com/access-aegis-cni)).
- Официалният Node.js пример на страницата използва `jose`.

### 1.2 Библиотека: `jose`

Източник: [createRemoteJWKSet](https://github.com/panva/jose/blob/main/docs/jwks/remote/functions/createRemoteJWKSet.md), [RemoteJWKSetOptions](https://github.com/panva/jose/blob/main/docs/jwks/remote/interfaces/RemoteJWKSetOptions.md), [jwtVerify](https://github.com/panva/jose/blob/main/docs/jwt/verify/functions/jwtVerify.md), [package.json](https://raw.githubusercontent.com/panva/jose/main/package.json).

- Текуща версия **6.x** (6.2.13 към момента), **ESM-only** (`"type": "module"`); `require()` работи само на Node с `require(esm)` (^20.19 || ^22.12 || >=23). За нас (TypeScript, ESM) е без значение.
- `createRemoteJWKSet(new URL(certsUrl))` сам кешира JWKS: „Fetches the JSON Web Key Set when the cache is missing or stale“; при непознат `kid` прави нов fetch, но не по-често от `cooldownDuration` (по подразбиране **30 s**); `cacheMaxAge` по подразбиране **10 min**; `timeoutDuration` 5 s. Това покрива ротацията на Cloudflare без наша логика: нов ключ → непознат `kid` → refetch.
- `jwtVerify(token, jwks, { issuer, audience })` проверява подпис, `exp`/`nbf`, `iss`, `aud` и връща `{ payload, protectedHeader }`.
- Алтернатива: `@fastify/jwt` поддържа JWKS чрез функция `secret` + пакета `get-jwks` ([README, „Verifying with JWKS“](https://github.com/fastify/fastify-jwt)). Повече зависимости за същото; `jose` директно е по-прозрачно. **Препоръка: `jose`.**

### 1.3 Къде във Fastify

Източник: [Fastify Hooks](https://fastify.dev/docs/latest/Reference/Hooks/), [fastify-plugin](https://github.com/fastify/fastify-plugin).

Ред на изпълнение: `onRequest → preParsing → preValidation → preHandler → …`. В `onRequest` body още не е парснато — т.е. отхвърляме неавтентикирани заявки преди да сме харчили работа по тях. Затова проверката е в **`onRequest`**, а не в `preHandler` (Fastify docs не казват изрично „ползвай onRequest за auth“, но дават точно този пример за отговор от hook). Плъгинът се обвива с `fastify-plugin`, за да не е капсулиран и `request.user` да е видим за всички routes.

Скица (`apps/api/src/plugins/cloudflare-access.ts`):

```ts
import fp from 'fastify-plugin';
import { createRemoteJWKSet, jwtVerify, errors as joseErrors } from 'jose';
import type { FastifyPluginAsync } from 'fastify';

export interface AccessUser {
  email: string;
  sub: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AccessUser;
  }
}

interface Options {
  teamDomain: string; // e.g. "https://<team-name>.cloudflareaccess.com"
  audience: string;   // Application Audience (AUD) tag
  allowedEmails?: string[]; // defense in depth; Access policy is the primary gate
  skipPaths?: string[];     // e.g. ["/healthz"]
}

const cloudflareAccess: FastifyPluginAsync<Options> = async (fastify, opts) => {
  const jwks = createRemoteJWKSet(new URL(`${opts.teamDomain}/cdn-cgi/access/certs`));
  const allowed = opts.allowedEmails?.map((e) => e.toLowerCase());
  const skip = new Set(opts.skipPaths ?? []);

  fastify.decorateRequest('user', null);

  fastify.addHook('onRequest', async (request, reply) => {
    if (skip.has(request.url)) return;

    const token = request.headers['cf-access-jwt-assertion'];
    if (typeof token !== 'string' || token.length === 0) {
      return reply.code(401).send({ error: 'missing_access_token' });
    }

    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: opts.teamDomain,
        audience: opts.audience,
      });
      const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
      if (!email || typeof payload.sub !== 'string') {
        return reply.code(401).send({ error: 'invalid_access_token' });
      }
      if (allowed && !allowed.includes(email)) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      request.user = { email, sub: payload.sub };
    } catch (err) {
      if (err instanceof joseErrors.JOSEError) {
        request.log.warn({ code: err.code }, 'access token rejected');
        return reply.code(401).send({ error: 'invalid_access_token' });
      }
      throw err;
    }
  });
};

export default fp(cloudflareAccess, { name: 'cloudflare-access' });
```

Регистрация и env:

```ts
await app.register(cloudflareAccess, {
  teamDomain: process.env.CF_ACCESS_TEAM_DOMAIN!, // https://<team>.cloudflareaccess.com
  audience: process.env.CF_ACCESS_AUD!,
  allowedEmails: process.env.ALLOWED_EMAILS?.split(','),
  skipPaths: ['/healthz'],
});
```

Какво връщаме:

| Случай | Отговор |
|---|---|
| Няма header | `401 { error: "missing_access_token" }` |
| Подпис/`exp`/`iss`/`aud` невалидни (`jose` хвърля `JWSSignatureVerificationFailed`, `JWTExpired`, `JWTClaimValidationFailed`…) | `401 { error: "invalid_access_token" }` |
| Валиден токен, но имейлът не е в нашия списък | `403` (на практика няма да се случи — Access вече го е спрял; списъкът е втора линия) |
| Валиден | `request.user = { email, sub }`; `user` в нашата база се мапва по `email` |

Бележки за спека:

- `jwtVerify` не проверява `type`; ако искаме, добавяме `payload.type === 'app'`.
- Никога не излагаме API-то освен през Tunnel; при локална разработка плъгинът се изключва или се ползва dev-режим с фиксиран потребител (отделно решение, извън това проучване).
- Тестове: `jose` може да генерира RSA двойка (`generateKeyPair('RS256')`) и да подпише тестов токен; JWKS се подава като `createLocalJWKSet` или се мокне fetch. Няма нужда от Cloudflare в тестовете.
- n8n/OpenClaw извикват API-то отвътре (Docker мрежа), не през Cloudflare — за тях е нужен отделен механизъм (service token или вътрешен header); извън обхвата тук.

### 1.4 Access приложение с One-time PIN за два имейла

Източници: [One-time PIN](https://developers.cloudflare.com/cloudflare-one/access-controls/identity-providers/one-time-pin/), [Self-hosted application](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/), [Access policies](https://developers.cloudflare.com/cloudflare-one/policies/access/), [Session management](https://developers.cloudflare.com/cloudflare-one/identity/users/session-management/).

Имената на менютата са по актуалната документация (Cloudflare ги преименува; старите URL-и редиректват).

1. **IdP**: Zero Trust → Integrations → Identity providers → *Add new identity provider* → **One-time PIN**. („New Zero Trust organizations use the Cloudflare identity provider as their default login method. OTP is no longer added automatically.“ — т.е. проверяваме дали вече е включен; `ai.yo-po.eu` вероятно вече го ползва.)
2. **Приложение**: Zero Trust → Access controls → Applications → *Create new application* → **Self-hosted and private** → *Add public hostname*: subdomain `<име>`, domain `yo-po.eu`. (Hostname-ът трябва да е proxied DNS запис в Cloudflare — т.е. първо се добавя route-ът в тунела, част 2.)
3. **Политика** (в същия екран или предварително в Access controls → Policies): action **Allow**, Include → selector **Emails** → двата адреса. Не „Emails ending in“ (би допуснало целия домейн). Include = OR, Require = AND, Exclude = NOT. „All Access applications are deny by default — a user must match an Allow policy.“
4. **Identity providers** на приложението: само One-time PIN; при един IdP се препоръчва *Apply instant authentication* (прескача екрана за избор).
5. **Session Duration**: по подразбиране 24 h; диапазон „from immediate timeout to one month“ (точните стойности в падащото меню — **НЕПОТВЪРДЕНО**). За домашно приложение на телефон/таблет е разумно да е дълго (напр. 1 месец), иначе PIN-ът ще досажда; kiosk таблетът ще трябва да се логва периодично.
6. След Create: Configure → Additional settings → копираме **AUD tag** → `CF_ACCESS_AUD`. Team name → `CF_ACCESS_TEAM_DOMAIN=https://<team>.cloudflareaccess.com`.

Поведение на OTP: Cloudflare праща имейл само ако адресът минава политиката („blocked users will not receive an email“); PIN-ът важи 10 минути, еднократен е; нов PIN инвалидира стария. Изпращач `noreply@notify.cloudflare.com`.

Ако предпочитаме infra-as-code (по-късно): Terraform `cloudflare_zero_trust_access_application` (`type = "self_hosted"`, `domain`, `session_duration = "720h"`, `allowed_idps`, `auto_redirect_to_identity = true`) и `cloudflare_zero_trust_access_policy` (`decision = "allow"`, `include { email = [...] }`). Синтаксисът е от docs в repo-то на provider-а; кой major на provider-а отразяват — **НЕПОТВЪРДЕНО** ([app](https://raw.githubusercontent.com/cloudflare/terraform-provider-cloudflare/master/docs/resources/zero_trust_access_application.md), [policy](https://raw.githubusercontent.com/cloudflare/terraform-provider-cloudflare/master/docs/resources/zero_trust_access_policy.md)).

---

## 2. Нов hostname в съществуващия cloudflared на `homesrv`

### 2.1 Какво намерихме (read-only, 2026-10-25)

Хост: `homesrv`, Ubuntu 24.04, `podman 4.9.3` (rootless, като `yordan`, `Linger=yes`), Docker 29.1.3 + Compose 2.40.3 (rootful, `yordan` е в група `docker`).

cloudflared е **rootless podman контейнер**, стартиран от **user systemd unit** `~/.config/systemd/user/cloudflared.service` (не Quadlet, а ръчен `podman run`):

```ini
# ~/.config/systemd/user/cloudflared.service (token redacted)
[Unit]
Description=Cloudflare Tunnel
After=network-online.target
Wants=network-online.target

[Service]
ExecStartPre=/usr/bin/podman rm -f cloudflared || true
ExecStart=/usr/bin/podman run --rm --name cloudflared --replace --pull=always \
  --network host \
  -v /srv/cloudflared:/etc/cloudflared \
  docker.io/cloudflare/cloudflared:latest tunnel --no-autoupdate run --token <REDACTED>
ExecStop=/usr/bin/podman stop -t 10 cloudflared
ExecStopPost=/usr/bin/podman rm -f cloudflared
Restart=on-failure
RestartSec=5
TimeoutStartSec=0

[Install]
WantedBy=default.target
```

`podman inspect cloudflared` потвърждава: `Cmd = ["tunnel","--no-autoupdate","run","--token",…]`, `NetworkMode = "host"`, единствен mount `/srv/cloudflared:/etc/cloudflared`, env само `PATH`, `container`, `SSL_CERT_FILE`, `HOME`, `HOSTNAME` (без `TUNNEL_TOKEN`). Версия `cloudflared 2026.10.1`, `--pull=always` → обновява се при всеки рестарт на unit-а.

```
$ ls -la /srv/cloudflared
total 8
drwxr-xr-x 2 root root 4096 Sep 23  2025 .
drwxr-xr-x 5 root root 4096 Sep 23  2025 ..
```

Празна директория, няма `config.yml`, няма `~/.cloudflared`. Извод: **тунелът е token-based / remotely managed** — ingress-ът живее в Cloudflare dashboard, а не на сървъра. Логът го показва директно (конфигурацията се получава от Cloudflare при стартиране):

```
INF Updated to new configuration config="{\"ingress\":[
  {\"hostname\":\"jellyfin.yo-po.eu\", \"originRequest\":{}, \"service\":\"http://127.0.0.1:8096\"},
  {\"hostname\":\"ai.yo-po.eu\",       \"originRequest\":{}, \"service\":\"http://localhost:18789\"},
  {\"service\":\"http_status:404\"}], \"warp-routing\":{\"enabled\":false}}" version=2
```

Как е публикуван **`ai.yo-po.eu`** (ориентирът): route в dashboard-а → `http://localhost:18789`. На хоста OpenClaw gateway е user systemd unit `openclaw-gateway.service` (`node …/openclaw/dist/index.js gateway --port 18789`), слуша на `127.0.0.1:18789` и `[::1]:18789`. Контейнерът го достига, защото е с `--network host` — споделя мрежовото пространство на хоста, вкл. loopback. (Podman: `host` — „Use the host's network namespace… full access to… TCP/UDP sockets bound to localhost“, [podman-run network](https://raw.githubusercontent.com/containers/podman/main/docs/source/markdown/options/network.md).) Без `--network host` rootless контейнер би бил зад slirp4netns (podman 4.x) и би трябвало `allow_host_loopback=true` + `10.0.2.2`, или `host.containers.internal`; при нас това не е нужно.

Странично наблюдение: логът има ~100 `ERR … dial tcp 127.0.0.1:18789: connect: connection refused` за последните часове (OpenClaw е бил рестартиран; в момента е `active`, отговаря `200`). Не е свързано със задачата.

Портове на хоста: 80/443 са свободни (няма Caddy, няма `/etc/caddy`); `8080` е qbittorrent (rootlessport), `8096` jellyfin, `54322` supabase db на emerald, `127.0.0.1:18083/15441/15442/18028` са emerald-verify контейнери. Caddy на `family` трябва да избере свободен порт на loopback, напр. `127.0.0.1:18090` (не 8080!).

### 2.2 Стъпки за `<име>.yo-po.eu → http://127.0.0.1:<Caddy порт>`

Източник: [Create a remotely-managed tunnel → Publish an application](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/).

Понеже ingress-ът е remote, **на сървъра не се променя нищо** — нито unit-ът, нито контейнерът, нито `/srv/cloudflared`. cloudflared получава новата конфигурация на живо („Updated to new configuration … version=N“ в лога).

1. Caddy от `family` compose-а публикува порт само на loopback, напр. в `docker-compose.yml`:
   ```yaml
   services:
     caddy:
       ports:
         - "127.0.0.1:18090:80"
   ```
   Caddyfile слуша на `:80` (TLS терминира Cloudflare; между cloudflared и Caddy е localhost, plain HTTP). cloudflared препраща `Host` както е дошъл, така че Caddy може да маршрутизира по hostname, ако някога има повече от един.
2. Cloudflare dashboard: **Networking → Tunnels** → избираме тунела на homesrv (connector ID започва с `fbdd80df…`) → таб **Routes** → **Add route** → **Published application**:
   - Subdomain: `<име>` (напр. `family`)
   - Domain: `yo-po.eu`
   - Service URL: `http://localhost:18090`
   → **Add route**.
   Според docs на Cloudflare това прави hostname-а достъпен веднага; DNS CNAME записът (`<име>.yo-po.eu → <tunnel-id>.cfargotunnel.com`) се създава от dashboard-а при добавяне на route — ако не се появи в DNS таба, създава се ръчно като proxied CNAME ([DNS record](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/dns/); автоматичното създаване не е изрично написано в текущите docs — **НЕПОТВЪРДЕНО**, но така са направени `ai`/`jellyfin`).
3. Проверка от сървъра: `podman logs --since 5m cloudflared | grep "Updated to new configuration"` — новият ingress трябва да включва `<име>.yo-po.eu`. После `curl -sI https://<име>.yo-po.eu` → очакваме `302` към `<team>.cloudflareaccess.com` (след като Access приложението от част 1.4 е създадено; преди това — отговор от Caddy).
4. Access приложението (част 1.4) се създава **след** route-а, защото изисква hostname-ът да съществува като Cloudflare DNS запис.

Редът в ingress-а няма значение за нас (hostname-ите са различни; catch-all `http_status:404` остава последен).

Ако някога се наложи локално управление (`config.yml` в `/srv/cloudflared`, `cloudflared tunnel route dns …`) — Cloudflare препоръчва remote за почти всичко („Locally-managed tunnels are intended for specific scenarios such as local development, testing, or legacy configurations“, [local management](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/)). Няма причина да мигрираме.

### 2.3 Provisioning чеклист (част 2)

- [ ] Избран loopback порт за Caddy (предложение `127.0.0.1:18090`), записан в `docs/concept.md`/compose.
- [ ] Route в dashboard: `<име>.yo-po.eu → http://localhost:18090`.
- [ ] CNAME се вижда в DNS на `yo-po.eu` (proxied).
- [ ] `podman logs cloudflared` показва новия ingress.
- [ ] Access self-hosted app + OTP политика (част 1.4); AUD tag и team domain в `.env` на API-то.

---

## 3. Self-hosted GitHub Actions runner за `yordanalexandrov/family`

### 3.1 Какво намерихме

Три runner директории, и трите регистрирани към **`https://github.com/yordanalexandrov/emerald`** (`.runner` → `gitHubUrl`), версия на runner-а 2.338.0, работят като `yordan`:

| Директория | Име | Как се стартира |
|---|---|---|
| `~/actions-runner` | `homesrv` | **system** unit `/etc/systemd/system/actions.runner.yordanalexandrov-emerald.homesrv.service` (`User=yordan`, `ExecStart=…/runsvc.sh`) — инсталиран със `sudo ./svc.sh install yordan` |
| `~/actions-runner-2` | `homesrv-2` | **user** unit `~/.config/systemd/user/actions-runner-2.service`: `ExecStart=/usr/bin/sg docker -c /home/yordan/actions-runner-2/run.sh` |
| `~/actions-runner-3` | `homesrv-3` | **user** unit `actions-runner-3.service`, същата форма |

`sg docker -c run.sh` в user unit-овете е workaround, за да е сигурно, че процесът има групата `docker` (user session-ът може да е стартиран преди добавянето в групата). `id yordan` днес показва `113(docker)`, така че `sg` вече не е строго необходим, но е безвреден. Docker socket: `srw-rw---- root docker /var/run/docker.sock`. Workspace на `homesrv-2`: `~/actions-runner-2/_work/emerald/emerald`.

### 3.2 Обхват: repo или акаунт?

GitHub docs: „You can add a self-hosted runner to a repository, an organization, or an enterprise“ ([Add runners](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners), [Self-hosted runners](https://docs.github.com/en/actions/concepts/runners/self-hosted-runners)). Ниво **личен акаунт не съществува** (по omission в docs — няма такава опция). Споделен runner за `emerald` и `family` би изисквал да преместим двете репота в organization — не си струва за две repo-та.

Една runner директория може да е регистрирана само към един обхват: `config.sh` отказва с „Cannot configure the runner because it is already configured“ ([ConfigurationManager.cs](https://raw.githubusercontent.com/actions/runner/main/src/Runner.Listener/Configuration/ConfigurationManager.cs)). **Решение: нова директория `~/actions-runner-family`, регистрирана към `yordanalexandrov/family`.** Пренасочване на `homesrv-3` от emerald е алтернатива (`./config.sh remove --token …` и пак `config.sh`), ако трите runner-а за emerald са излишни.

### 3.3 Стъпки за регистрация

Източници: [Add runners](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners), [REST registration-token](https://docs.github.com/en/rest/actions/self-hosted-runners), [config.sh опции (Runner.cs)](https://raw.githubusercontent.com/actions/runner/main/src/Runner.Listener/Runner.cs), [Apply labels](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/apply-labels), [Configure the application (svc.sh)](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/configure-the-application).

```bash
# на homesrv, като yordan
mkdir -p ~/actions-runner-family && cd ~/actions-runner-family

# същата версия като съществуващите (2.338.0) или последната от
# https://github.com/actions/runner/releases
RUNNER_VERSION=2.338.0
curl -fsSL -o runner.tar.gz \
  "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
tar xzf runner.tar.gz && rm runner.tar.gz

# registration token: Settings → Actions → Runners → New self-hosted runner
# (изисква да си owner на repo-то; токенът важи 1 час), или от работната машина:
#   gh api -X POST repos/yordanalexandrov/family/actions/runners/registration-token -q .token
./config.sh --unattended \
  --url https://github.com/yordanalexandrov/family \
  --token <REG_TOKEN> \
  --name homesrv-family \
  --labels family,homesrv \
  --work _work
```

Опции (`config.sh --help`): `--unattended` без интерактивни въпроси; `--name` (по подразбиране hostname — задаваме различно, за да не се бърка с `homesrv`); `--labels` добавя към default-ните `self-hosted,Linux,X64`; `--replace` при пререгистрация със същото име; `--ephemeral` — не ни трябва (постоянен deploy runner). Labels не могат да се сменят после без пререгистрация.

**Като услуга.** Два варианта, и двата вече ползвани на homesrv:

Вариант A — system unit през `svc.sh` (както `homesrv`):

```bash
cd ~/actions-runner-family
sudo ./svc.sh install yordan     # създава actions.runner.yordanalexandrov-family.homesrv-family.service
sudo ./svc.sh start
sudo ./svc.sh status
```

Името на unit-а е по шаблона `actions.runner.<owner>-<repo>.<runner-name>.service` ([SystemdControlManager.cs](https://raw.githubusercontent.com/actions/runner/main/src/Runner.Listener/Configuration/SystemdControlManager.cs)). Процесът върви като `yordan` → има `docker` групата от `/etc/group` (service логинът не зависи от сесия).

Вариант B — user unit (както `homesrv-2/3`), без sudo:

```ini
# ~/.config/systemd/user/actions-runner-family.service
[Unit]
Description=GitHub Actions Runner homesrv-family
After=network-online.target

[Service]
WorkingDirectory=/home/yordan/actions-runner-family
ExecStart=/home/yordan/actions-runner-family/run.sh
Restart=always
RestartSec=5
KillMode=control-group
KillSignal=SIGINT
TimeoutStopSec=5min

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now actions-runner-family.service
systemctl --user status actions-runner-family.service
```

`Linger=yes` вече е включен за `yordan`, така че user unit-ът стартира при boot. Ако `docker ps` от job-а върне „permission denied“, значи user manager-ът е стартиран преди групата да е добавена — или `loginctl terminate-user yordan` + вход наново, или `ExecStart=/usr/bin/sg docker -c …run.sh` както при `homesrv-2`. Препоръка: **вариант A** — това е официалният път, без `sg` трик; ако предпочитаме всичко в user space — вариант B копира работещия образец.

Проверка: Settings → Actions → Runners в `family` показва `homesrv-family` като *Idle*.

### 3.4 Deploy job: как стига до Docker на хоста

Източници: [Use in a workflow](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/use-in-a-workflow), [Variables (GITHUB_WORKSPACE)](https://docs.github.com/en/actions/reference/workflows-and-actions/variables), [Workflow syntax (concurrency, environment)](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax), [Secrets](https://docs.github.com/en/actions/concepts/security/secrets), [Secure use](https://docs.github.com/en/actions/reference/security/secure-use), [Docker post-install](https://docs.docker.com/engine/install/linux-postinstall/).

- Runner-ът е процес на хоста като `yordan` ∈ `docker` → `docker` CLI в стъпките говори директно с `/var/run/docker.sock`. Няма docker-in-docker, няма SSH. (Docker docs: групата `docker` е еквивалент на root — приемливо за домашен сървър, вече е така за emerald.)
- Checkout отива в `GITHUB_WORKSPACE` = `~/actions-runner-family/_work/family/family`; `docker compose` се пуска оттам. Compose project name по подразбиране е името на директорията (`family`) — задаваме го изрично с `name:` в compose файла или `-p family`, за да не се бърка с други проекти.
- Secrets → `.env` файл в workspace-а, който compose чете (`env_file:` или `${VAR}` интерполация). GitHub редактира стойностите на secrets в логовете, но „automatic redaction is not guaranteed“ — не ги `cat`-ваме и не ги подаваме като аргументи. `.env` се презаписва при всеки deploy и е в `.gitignore`. Volume-ите с данни (Postgres) са named volumes, не в workspace-а, за да преживяват чекаутите.
- `concurrency` с `cancel-in-progress: false` гарантира, че два push-а не правят паралелни `compose up`.
- `environment: production` дава отделни secrets и (по желание) required reviewer.
- Repo-то е частно — self-hosted runner с public repo е забранено по здрав разум („should almost never be used for public repositories“, GitHub).

```yaml
# .github/workflows/deploy.yml
name: deploy
on:
  push:
    branches: [master]
  workflow_dispatch:

concurrency:
  group: deploy-production
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: [self-hosted, linux, family]
    environment: production
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4

      - name: Write runtime env
        run: |
          umask 077
          cat > .env <<EOF
          POSTGRES_PASSWORD=${{ secrets.POSTGRES_PASSWORD }}
          CF_ACCESS_TEAM_DOMAIN=${{ secrets.CF_ACCESS_TEAM_DOMAIN }}
          CF_ACCESS_AUD=${{ secrets.CF_ACCESS_AUD }}
          ALLOWED_EMAILS=${{ secrets.ALLOWED_EMAILS }}
          EOF

      - name: Deploy
        run: |
          docker compose -p family pull --ignore-buildable
          docker compose -p family up -d --build --remove-orphans
          docker image prune -f

      - name: Smoke test
        run: curl -fsS http://127.0.0.1:18090/healthz
```

(`/healthz` минава през Caddy → API без Access токен, затова е в `skipPaths` на плъгина от 1.3.)

Алтернатива за `.env`: да живее постоянно извън workspace-а (напр. `/srv/family/.env`, права `600`) и job-ът само да прави `docker compose --env-file /srv/family/.env up -d --build`. Тогава секретите не минават през GitHub изобщо, но ротацията им е ръчна на сървъра. За MVP: secrets в GitHub Environment — една точка на истина, видима в UI-то.

### 3.5 Provisioning чеклист (част 3)

- [ ] `~/actions-runner-family` разархивиран, `config.sh` към `yordanalexandrov/family` с име `homesrv-family`, labels `family,homesrv`.
- [ ] Услуга: `sudo ./svc.sh install yordan && sudo ./svc.sh start` (или user unit).
- [ ] Runner-ът е *Idle* в Settings → Actions → Runners.
- [ ] Тестов job: `docker ps` и `docker compose version` минават на runner-а.
- [ ] GitHub Environment `production` със secrets: `POSTGRES_PASSWORD`, `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `ALLOWED_EMAILS`.
- [ ] `.env` в `.gitignore`; named volumes за Postgres.
- [ ] `deploy.yml` с `concurrency` и `runs-on: [self-hosted, linux, family]`.

---

## Отворени въпроси (за спека)

1. Име на hostname-а (`family.yo-po.eu`? `home.yo-po.eu`?) и порт на Caddy (предложение `127.0.0.1:18090`).
2. Session duration на Access за kiosk таблета — колко дълго е приемливо.
3. Как n8n и OpenClaw се автентикират към API-то отвътре (service token в Access или вътрешен header по Docker мрежата) — отделно проучване.
4. Dev режим на API-то без Cloudflare (фиксиран потребител или подписан тестов JWT).
5. Дали да пренасочим `homesrv-3` към `family` вместо четвърти runner.
