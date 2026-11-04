# integrations

## Overview

Клиентите към външните системи, които API-то чете или към които праща: Google Calendar и Wallet за кеша на дашборда (Синхронизация) и Web Push за Известията. Всеки клиент е по избор: без конфигурацията си (`GOOGLE_*`, `WALLET_*`, `VAPID_*` в `src/config.ts`) не се създава в `src/server.ts`, а съответната функция показва „unconfigured“ или не праща нищо. OpenClaw има свой клиент в `src/openclaw`.

## Subdirectories & Boundaries

- google-calendar: [./google-calendar/README.md](./google-calendar/README.md) – `createCalendarClient` чете събитията на календар през service account (само за четене, повторни опити при rate limit и 5xx, 404 е `CalendarNotSharedError`).
- wallet: [./wallet/README.md](./wallet/README.md) – `createWalletClient` чете текущия период на бюджет от BudgetBakers Wallet (`WalletError` с кодове, един повторен опит при 5xx).
- web-push: [./web-push/README.md](./web-push/README.md) – `createWebPushSender` праща VAPID-подписани съобщения (`PushRejectedError`; 404/410 значат изчезнал абонамент).
