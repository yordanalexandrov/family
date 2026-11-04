# src/scripts

## Overview

Ръчни CLI инструменти на API-то, пускани през `pnpm` скриптове от `apps/api/package.json`. Не са част от сървъра и от `pnpm test`.

## Interface

- `calendar-probe.ts` (`pnpm --filter api calendar:probe`) – след provisioning чете прозореца на Синхронизацията (`syncWindow` от `src/services/calendar-sync.ts`) за всеки календар от `GOOGLE_CALENDARS` с `GOOGLE_SERVICE_ACCOUNT_JSON` и печата колко събития има всеки.
- `vapid-keys.ts` (`pnpm --filter api vapid-keys`) – печата нова двойка `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` (`webpush.generateVAPIDKeys`).

## Invariants

- `calendar-probe.ts` – без конфигурация на Google Calendar печата „unconfigured“ и излиза с 1. При грешка на който и да е календар също излиза с 1, иначе с 0. Не пише в базата.
- `vapid-keys.ts` (коментар) – нова двойка ключове прекратява всички съществуващи абонаменти: устройствата трябва отново да включат известията.

## Side Effects

- `calendar-probe.ts` – чете env (`loadConfig`), мрежови заявки към Google Calendar, stdout, `process.exit`.
- `vapid-keys.ts` – stdout (печата тайния ключ: изходът не бива да се споделя).

## Verification

- Run: `pnpm --filter api typecheck` (няма specs); ръчно: `pnpm --filter api calendar:probe`.
