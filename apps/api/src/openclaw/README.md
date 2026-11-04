# openclaw

## Overview

Клиентът към OpenClaw gateway през OpenAI-съвместимия `POST /v1/chat/completions` (ADR-0004). Един ход на агента е за един AI контракт (`AiContract` от `packages/shared`). Входът се проверява преди изпращане, а отговорът се валидира с output схемата на контракта; при невалиден отговор има един повторен опит с проблемите. Използва се от `src/services/contract-requests.ts` и от smoke скриптовете в `apps/api/scripts`.

## Interface

- `client.ts:createOpenClawClient` – клиентът за `OpenClawConfig` (от `src/config.ts`) или `null` без gateway парола.
- `client.ts:OpenClawClient` – `complete(contract, input, options)`: един валиден отговор на контракта.
- `client.ts:CompleteOptions` – `agent` (изпраща се като `model: openclaw/<agent>`), `timeoutMs` (един бюджет за цялото извикване), `signal` и `images`.
- `client.ts:ContractImage` – картинка към входа (байтове и media type, изпраща се като `data:` URL).
- `client.ts:OpenClawLog` – къде се логва всеки опит (подходящ е Fastify logger-ът).
- `client.ts:OpenClawError, OpenClawHttpError, OpenClawTimeoutError, OpenClawInvalidOutputError` – провалите на клиента.
- `client.ts:OpenClawFailure` – кодът на провала на клиента: `timeout`, `invalid_output` или `http_<status>`.
- `client.ts:failureCode` – `ContractFailure`, който се пази като `error` на AI заявката: кодът на `OpenClawError`, `aborted` при прекъсване от извикващия, иначе `error` (бъг).

## Invariants

- `client.ts:OpenClawClient` (коментар) – вход, който не минава `contract.inputSchema`, е бъг на извикващия: хвърля обикновен `Error` и нищо не се изпраща.
- `client.ts:createOpenClawClient` – отговорът трябва да е валиден за `contract.outputSchema(input)`. При невалиден има точно един повторен опит с проблемите; след втория се хвърля `OpenClawInvalidOutputError`. Повторният опит праща `images` пак, само в последното user съобщение (не и в първото). `describeIssues` връща само първите 10 проблема.
- `client.ts:OpenClawTimeoutError` – `timeoutMs` покрива цялото извикване, повторният опит включително. При изтичане заявката се прекъсва, а с нея и изпълнението на агента.
- `client.ts:createOpenClawClient` (коментар) – връща `null` без gateway парола, което е позволено само при `AUTH_MODE=dev`. Тогава routes, които искат OpenClaw, отговарят 503 `openclaw_unavailable`.
- `client.ts:createOpenClawClient` (коментар) – логва продължителност и използвани token-и, никога request headers (паролата е в `Authorization`).
- `client.ts:createOpenClawClient` – тялото винаги носи `response_format` `json_schema` с `contract.responseFormat` и `strict: true`, и `max_completion_tokens` = `MAX_COMPLETION_TOKENS` (6000). Без `user` (всяко извикване е нова сесия) и без `stream`.
- `client.ts:parseOutput` – обграждащ markdown fence (` ``` ` или ` ```json `) се маха, после отговорът се парсва като JSON и се проверява със схемата.

## Side Effects

- Мрежа: HTTP `POST` към `${OPENCLAW_URL}/v1/chat/completions` с паролата от `OPENCLAW_GATEWAY_PASSWORD`.
- Логване на всеки опит през `OpenClawLog`.

## Verification

- Run: `pnpm --filter api test src/openclaw`. Срещу истинския gateway: smoke скриптовете (`pnpm --filter api suggest:smoke` и др.) по `docs/openclaw/README.md`.
