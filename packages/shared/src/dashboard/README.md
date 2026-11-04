# dashboard

## Overview

Чистата логика зад таблото (киоск, телевизор, телефон): времето в часовата зона на семейството, групиране и обединяване на календарни събития, свежест на синхронизацията и темпото на бюджета. Схемата на отговора на таблото е в [../schemas/README.md](../schemas/README.md).

## Interface

- `time.ts:FAMILY_TIME_ZONE`, `DateKey`, `HOUR_MS`, `DAY_MS` — часовата зона, типът дата `YYYY-MM-DD` и константи в милисекунди.
- `time.ts:dateKeyInSofia`, `startOfDayInSofia`, `atHourInSofia` — дати и моменти по софийско време.
- `time.ts:utcMidnightOf`, `daysBetween`, `addDays` — аритметика на `DateKey` в UTC.
- `time.ts:Theme`, `themeForHour` — светла или тъмна тема според часа в София.
- `time.ts:groupEventsByDay` — по един `DayEvents` за всеки ден в `[from, toExclusive)`, включително празните.
- `dedupe.ts:CalendarEventRow`, `dedupeEvents` — обединява редовете на едно и също събитие от няколко източника на календар в `CalendarEvent` със списък `sources`.
- `freshness.ts:STALE_AFTER_MS`, `freshness`, `formatAge`, `formatDataAge` — свежест на източник (`unconfigured`, `failed`, `stale`, `ok`) и етикети за възраст на български.
- `budget.ts:dailyPace`, `isOverBudget` — остатък на ден до края на периода и дали остатъкът е под нула.

## Invariants

- `time.ts:FAMILY_TIME_ZONE` — `'Europe/Sofia'`; всяка граница на ден минава през нея.
- `time.ts:startOfDayInSofia` — приема, че полунощ никога не попада в прескок на лятното часово време; `atHourInSofia` е валидна само за часове от 04:00 нататък.
- `time.ts:themeForHour` — тъмна при час >= 20 или < 7, иначе светла.
- `time.ts:groupEventsByDay` — първо целодневните събития, после по начало, после по заглавие; краят на целодневно събитие е изключен; многодневно събитие се показва във всеки свой ден.
- `freshness.ts:STALE_AFTER_MS` — календар 20 мин, бюджет 3 ч; `freshness` проверява по ред `unconfigured`, `failed`, липса на успешен run, възраст строго над прага.
- `dedupe.ts:dedupeEvents` — обединява по ключ `[icalUid, originalStart]`; първият ред дава полетата; редове с `icalUid === null` никога не се обединяват; изходът е сортиран по начало.
- `budget.ts:dailyPace` — дните включват и двата края (`daysBetween(today, periodEnd) + 1`); при 0 или по-малко дни връща целия остатък; резултатът може да е отрицателен.

## Side Effects

- None. `freshness.ts:freshness`, `formatAge`, `formatDataAge` и `time.ts:themeForHour` приемат `now` като параметър; `dedupe.ts:dedupeEvents` променя само обекти, които сама създава.

## Verification

- Run: `pnpm --filter @family/shared test src/dashboard`
