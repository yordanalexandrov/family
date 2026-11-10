# plugins

## Overview

Fastify плъгините, които `buildApp()` (`src/app.ts`) регистрира преди routes: обработката на грешки, проверката на Cloudflare Access, Действащия потребител и собствения cron на API-то. `scope.ts` определя кои заявки са към API-то (`/api/*`), т.е. кои минават зад Access и изискват действащ потребител.

## Interface

- `error-handler.ts` (default, `fp` с име `error-handler`) – `setErrorHandler` и `setNotFoundHandler` с тяло `ApiErrorResponse` от `packages/shared`. Непознат адрес е 404 `not_found` („Няма такъв адрес“).
- `error-handler.ts:HttpError` – отказ, по който клиентът може да действа: `statusCode`, `code`, `message` (на български, стига до екрана).
- `cloudflare-access.ts` (default, `fp` с име `cloudflare-access`) – попълва `request.user`; `CloudflareAccessOptions` е `AuthConfig` от `src/config.ts` плюс тестов `jwks`.
- `cloudflare-access.ts:AccessUser` – кой е минал през Access: проверен e-mail и `sub`. Това не е действащият потребител.
- `acting-user.ts` (default, `fp` с име `acting-user`) – попълва `request.actor` от header `X-Acting-User`; route config `actingUser?: boolean | 'optional'`.
- `acting-user.ts:actorOf` – действащият потребител на route с `actingUser: 'optional'`, `undefined` без такъв (kiosk).
- `scheduler.ts` (default, `fp` с име `scheduler`) – cron задачи: `calendar` (5 мин), `budget` (60 мин), `menu-propose` (15 мин), `reminders` (5 мин), `prune-runs` (24 ч; трие `sync_run` по-стари от `KEEP_RUNS_DAYS` = 7 дни, без последния успех на всеки източник), `prune-inbox` (24 ч; `app.inbox.prune()` трие записите на Входящата кутия, необновявани 30 дни), `step-photo-orphans` (60 мин).
- `scheduler.ts:SchedulerOptions, Job` – `firstRunDelayMs` (по подразбиране 5 s); задача с `name`, `intervalMs`, `jitter`, `run`.
- `scope.ts:isApiRequest` – дали заявката е към `/api/*`.

## Invariants

- `scope.ts:isApiRequest` – решава се по намерения route (`routeOptions.url`), не по суровия URL (`/%61pi/users` се декодира до `/api/users`). Само при 404 се ползва суровият URL.
- `cloudflare-access.ts` – при `mode` `cloudflare` всяка `/api/*` заявка трябва да има `cf-access-jwt-assertion`. Липсата е 401 `missing_access_token`. `jwtVerify` проверява подпис, `exp`/`nbf`, issuer = team domain, audience, само `RS256`; провалът е 401 `invalid_access_token`.
- `cloudflare-access.ts` – e-mail-ът от token-а (lowercase) трябва да е в `ALLOWED_EMAILS`, иначе 403 `forbidden`. Service token-и без e-mail не се пускат.
- `cloudflare-access.ts` – при `mode` `dev` token не се проверява (логва се предупреждение) и всяка заявка идва от `DEV_USER_EMAIL`. `src/config.ts:loadConfig` отказва `dev` в production.
- `acting-user.ts` – за `/api/*` routes без `actingUser: false` липсващ header е 400 `missing_acting_user` (при `'optional'` е позволен). Header, който не е uuid или не е познат потребител, е 400 `unknown_acting_user`.
- `error-handler.ts` – грешка от валидацията е 400 `validation_error` с `issues`. `ServiceRefusal` от `src/services/errors.ts` се мапва по `REFUSALS` (`NotFoundError` 404, `ConflictError` и `AlreadyImportedError` 409, `ForbiddenError` 403, `InvalidReferenceError` и `InvalidActionError` 400, `OpenClawUnavailableError` 503, `UnsupportedPhotoError` 415). Тялото носи и `error.details` на отказа (`serviceRefusal`).
- `error-handler.ts:bodyOf` – `HttpError` казва своя код и съобщение. Друга 4xx грешка получава код `error`, а 5xx получава `internal_error` („Вътрешна грешка“) и не издава нищо от себе си (вътрешностите не изтичат). Всяка 5xx се логва изцяло.
- `scheduler.ts` – всяка задача е верига от `setTimeout`: следващото изпълнение се планира чак след като предишното е свършило, с `jitter` по подразбиране 0.25 (0 за `reminders`, `prune-runs`, `prune-inbox`, `step-photo-orphans`). `calendar`, `budget` и `menu-propose` се пускат само ако са конфигурирани.
- `scheduler.ts` – при `preClose` спира таймерите и изчаква текущите задачи, преди пулът към базата да се затвори в `onClose`.

## Side Effects

- `scheduler.ts` – таймери (`setTimeout`). Задачите викат `app.calendarSync`, `app.budgetSync`, `app.menuSchedule`, `app.reminders`, `pruneRuns` и `removeOrphanStepPhotos`, които пишат в базата, викат външните услуги и OpenClaw и пращат push.
- `cloudflare-access.ts` – мрежа: изтегля JWKS от `/cdn-cgi/access/certs` на team domain-а (`createRemoteJWKSet`).
- `acting-user.ts` – чете потребителите през `app.users` (база, кеш за минута).
- `error-handler.ts` – логва 5xx грешките.

## Verification

- Run: `pnpm --filter api test src/plugins` (нужна е тестовата база: `docker compose -p family-test --profile test up -d postgres-test`)
