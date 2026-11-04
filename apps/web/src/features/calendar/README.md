# calendar — екранът „Календар“

## Overview
Екранът „Календар“: следващите 14 дни със събития, аватари на източниците и ръчна синхронизация. Тук е и общият `DayEventList`, който ползват и картите на дашборда. Данните идват от React Query с офлайн кеш в localStorage.

## Interface
- `CalendarScreen.tsx:CalendarScreen` — пълният екран (kiosk: едри редове и „Назад“; „Обнови“ само на лично устройство)
- `DayEventList.tsx:DayEventList` — събитията на един ден (`day`, `now`, `itemId?`, `compact?`, `maxEvents?`)
- `SourceAvatars.tsx:SourceAvatars`, `sourceAvatar`, `eventColor`, `useSourceAvatars`, `SourceAvatar` — аватари и цвят на събитие по източник на календар
- `use-calendar-days.ts:useCalendarDays`, `use-calendar-days.ts:CalendarDays` — дните от днес с офлайн кеш

## Invariants
- `use-calendar-days.ts:useCalendarDays` — заявка от `today` до `addDays(today, CALENDAR_MAX_DAYS)`; от кеша се показват само дни от днес нататък
- `use-calendar-days.ts:cache` — ключ `family.calendarCache`, проверка с `calendarEventsResponseSchema.shape.days`
- `CalendarScreen.tsx:CalendarScreen` — „Обнови“ само при `isPersonalDevice(mode)`; изключен без мрежа или докато тече синхронизация
- `DayEventList.tsx:eventStates` — минало и „следващо“ се смятат само за днешния ден; събитията за цял ден се пропускат; „следващо“ е само едно
- `DayEventList.tsx:DayEventList` — празно заглавие се показва като „Заето“; при `maxEvents` останалите стават ред `+N`
- `SourceAvatars.tsx:eventColor` — `person-family` при брой източници, различен от 1 (покана от няколко или нито един), или при `colorToken === 'family'`
- `SourceAvatars.tsx:sourceAvatar` — семейният аватар „С“ е при `kind === 'family'` или `colorToken === 'family'`; иначе инициалът на собственика, без него първата буква на името
- `DayEventList.tsx:whenLabel` — събитие, започнало преди деня, е „продължава“; целодневно е „цял ден“; иначе часът на началото; празен ден показва „Нищо планирано“

## Side Effects
- `use-calendar-days.ts:useCalendarDays` — GET `/api/calendar/events?from=&to=` (през `useCalendarEvents`); localStorage `family.calendarCache`
- `CalendarScreen.tsx:refresh` — POST `/api/sync/calendar` (през `useSync('calendar')`) и Toast с резултата
- `CalendarScreen.tsx:CalendarScreen` — `useNow(30_000)`; чете свежестта от `useDashboard()`

## Verification
- Run: `pnpm --filter web test src/features/calendar`
