# integrations/web-push

## Overview

Изпращачът на Web Push (ADR-0006). Подписва с VAPID и криптира съобщението за устройството чрез `web-push`. Използва се от `src/services/push.ts`. Създава се в `src/server.ts` само когато са зададени и трите `VAPID_*`.

## Interface

- `sender.ts:PushTarget` – устройство: `endpoint` на абонамента и ключовете му.
- `sender.ts:PushSender` – `(target, payload) => Promise<void>`: предава едно криптирано съобщение на push услугата (в production е `web-push`, в specs е mock).
- `sender.ts:createWebPushSender` – production `PushSender` за `VapidConfig` (от `src/config.ts`).
- `sender.ts:PushRejectedError` – push услугата е отговорила с грешен `statusCode`; 404 и 410 значат, че абонаментът вече го няма.

## Invariants

- `sender.ts:PushSender` (коментар) – отхвърля с `PushRejectedError` при статус-грешка и с друга грешка, когато услугата е недостъпна.
- `sender.ts:TTL_SECONDS` – push услугата пази съобщението за офлайн устройство 4 часа; след това напомнянето е остаряло.
- `sender.ts:REQUEST_TIMEOUT_MS` – 15 s.
- `sender.ts:createWebPushSender` – праща с `urgency: 'high'`.

## Side Effects

- Мрежа: HTTPS към endpoint-а на push услугата на устройството.

## Verification

- Run: `pnpm --filter api test` (локално няма specs; `src/services/push.ts` и routes на известията се тестват с mock `PushSender`).
