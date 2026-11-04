# dashboard — Дашбордът

## Overview
Дашбордът: един екран, който според режима на устройството подрежда ядрото с пръстена на деня, „Днес“, бюджета, следващите дни, „Извади месото“ и действията върху днешното ястие. Телефонът и браузърът ползват свой изглед, а kiosk и TV — `KioskLayout` с именувани слотове и фокус с дистанционно. Данните идват от `GET /api/dashboard` с офлайн кеш; чистата логика (геометрия на пръстена, слотове, мащаб на ядрото) е в отделни `.ts` модули.

## Interface
- `DashboardScreen.tsx:DashboardScreen` — входът; `KioskLayout` за kiosk/TV, иначе телефонен изглед
- `use-dashboard-data.ts:useDashboardData`, `DashboardData` — данните през офлайн кеша
- `KioskLayout.tsx:KioskLayout` — решетка със слотове `core`, `left-1` (бюджет), `right-1` (следващи дни); в kiosk и ъглови връзки „Рецепти“ (`/recipes`) и зъбче към `/settings`
- `Core.tsx:Core`, `DayRing.tsx:DayRing`, `Clock.tsx:Clock` — ядро, пръстен на деня, часовник
- `day-ring.ts:dayRingSegments`, `dayRingMarkers`, `ringAngle` — геометрия на пръстена
- `core-fit.ts:useCoreFit`, `coreFitScale`, `measureCoreFit`, `FitRect`, `CORE_FIT_RADIUS` — смаляване на съдържанието, за да се побере в ядрото
- `BudgetPanel.tsx:BudgetPanel`, `NextDaysPanel.tsx:NextDaysPanel`, `TodayList.tsx:TodayList`, `TodayList.tsx:todayItemId` — карти бюджет, следващи дни, „Днес“
- `TodayCooking.tsx:TodayCooking`, `TodayCooking.tsx:RecipeTarget`, `ThawCard.tsx:ThawCard`, `SyncButton.tsx:SyncButton` — „Днес се готви“, „Извади месото“, ръчна синхронизация
- `today-actions.ts:useClaimCook`, `today-actions.ts:useMarkThawed` — „Аз“ (готвач) и „Извадих“
- `days.ts:splitDays`, `dashboard-slots.ts:gridTemplateRows`, `dashboard-slots.ts:neighbourSlot`, `dashboard-slots.ts:WIDE_QUERY`, `SlotName`, `KioskGrid`, `Direction`, `use-remote-focus.ts:useRemoteFocus` — разделяне на дните, решетка и фокус със стрелки

## Invariants
- `DashboardScreen.tsx:DashboardScreen` — стенни режими са само `kiosk` и `tv`; `SessionExpired` само там; `interactive` е само в kiosk
- `DashboardScreen.tsx:useRefetchOnNewDay` — презарежда при смяна на датата в София; `now` се опреснява на 30 s
- `days.ts:splitDays` — без днешен ден връща празен ден; следващите са само със `date > today`
- `KioskLayout.tsx:CORE_MAX_EVENTS`, `KioskLayout.tsx:DAY_MAX_EVENTS` — 5 събития в ядрото, 3 на ден в „Следващите дни“
- `use-remote-focus.ts:useRemoteFocus` — активна само без `interactive` (TV); стрелките местят фокуса по `neighbourSlot`, Enter вика `onEnter` (в `KioskLayout` това е `state.refetch`, презарежда данните)
- `day-ring.ts:ringAngle` — 1 час = 15°, 00:00 горе, по `FAMILY_TIME_ZONE`
- `day-ring.ts:dayRingSegments` — събитията за цял ден не са на пръстена; най-много две писти, третото застъпващо се е `thin`
- `day-ring.ts:dayRingMarkers` — по маркер за всеки източник; събития на един източник на под 20° (`MARKER_MERGE_DEGREES`, 80 мин) от първото се сливат в един маркер с брой
- `KioskLayout.tsx:OPENS_CALENDAR` — в kiosk слотът `right-1` и ядрото (`Core.tsx:opensCalendar`) водят към `/calendar`
- `Core.tsx:Core` — при `unconfigured` не показва кешираните събития; празно заглавие е „Заето“
- `TodayCooking.tsx:Row` — „Днес се готви“ води към изгледа на рецептата (`recipeTarget="view"`, телефон) или към Готвене с `?servings=` (`"cooking"`, kiosk), без рецепта — към `/menu`; порциите се показват само ако се различават от „по 1 за всеки“
- `TodayCooking.tsx:CookLine` — „Аз“ само с действащ потребител, без готвач и с `mealId`
- `today-actions.ts:useMealAction` — при успех кешът на дашборда се поправя веднага, а при `onSettled` (и при отказ `cook_taken`) се инвалидират дашбордът и менюто
- `SyncButton.tsx:useSourceSync` — не прави нищо офлайн или докато тече; съобщението изчезва след 5000 ms (`MESSAGE_MS`)

## Side Effects
- `use-dashboard-data.ts:useDashboardData` — GET `/api/dashboard` (през `useDashboard`); localStorage `family.dashboardCache`
- `SyncButton.tsx:useSourceSync` — POST `/api/sync/calendar` или `/api/sync/budget`
- `today-actions.ts:useClaimCook` — POST `/api/menu/meals/:id/cook-claim`; `useMarkThawed` — POST `/api/menu/meals/:id/thawed`; `setQueryData`/`invalidateQueries` на `queryKeys.dashboard` и `menuKeys.plans`
- `DashboardScreen.tsx:useRefetchOnNewDay` — `refetchQueries` на дашборда; `selectTodayEvent` — `scrollIntoView`
- `use-remote-focus.ts:useRemoteFocus` — `keydown` на `document` и `element.focus()`
- `core-fit.ts:useCoreFit` — `ResizeObserver` и CSS променлива `--core-fit`

## Verification
- Run: `pnpm --filter web test src/features/dashboard`
