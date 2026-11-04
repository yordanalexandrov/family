# integrations/google-calendar

## Overview

Клиент за четене на Google Calendar през service account (REST върху `fetch` на auth клиента от `google-auth-library`, който взима и подновява access token-а). Използва се от календарната Синхронизация (`src/services/calendar-sync.ts`) и от `src/scripts/calendar-probe.ts`. Създава се в `src/server.ts` само когато са зададени `GOOGLE_SERVICE_ACCOUNT_JSON` и `GOOGLE_CALENDARS`.

## Interface

- `client.ts:createCalendarClient` – клиентът за ключа от `GOOGLE_SERVICE_ACCOUNT_JSON`.
- `client.ts:GoogleCalendarClient, ListEvents` – `listEvents(calendarId, from, to, timeZone)` чете събитията на един календар между два момента.
- `client.ts:GoogleEvent, GoogleEventTime` – полетата от Google Event, които дашбордът чете (`date` за целодневни, `dateTime` за останалите).
- `client.ts:CalendarNotSharedError` – календарът отговаря 404 (не е споделен със service account-а или id-то е грешно).
- `client.ts:CalendarClientOptions` – настройки на клиента (виж файла).

## Invariants

- `client.ts:SCOPE` – само `calendar.events.readonly`.
- `client.ts:createCalendarClient` – заявка с `singleEvents: 'true'`, `orderBy: 'startTime'`, `timeZone` и `maxResults: '250'`, и обхождане на всички страници по `pageToken`; събитията със `status` `cancelled` се изпускат.
- `client.ts:createCalendarClient` – 404 е `CalendarNotSharedError` и не се повтаря.
- `client.ts:isRetryable, backoffMs, MAX_ATTEMPTS` – до 4 опита на страница при 429, 5xx и 403 `rateLimitExceeded`/`userRateLimitExceeded`; експоненциален backoff `2^n` s плюс до 1 s jitter, най-много `MAX_BACKOFF_MS` (32 s).
- `client.ts:REQUEST_TIMEOUT_MS` – 20 s на заявка.
- `client.ts:parseServiceAccount` – грешките никога не цитират входа, защото той е тайна.

## Side Effects

- Мрежа: HTTPS към `https://www.googleapis.com/calendar/v3` и към OAuth на Google за token (`google-auth-library`).
- Таймери: `setTimeout` между повторните опити.

## Verification

- Run: `pnpm --filter api test` (локално няма specs; Синхронизацията се тества в `src/services`). Ръчна проверка срещу истинския календар: `pnpm --filter api calendar:probe`.
