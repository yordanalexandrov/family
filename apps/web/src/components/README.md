# components — общи UI компоненти

## Overview
Споделени презентационни компоненти и малки куки за целия клиент: карта, лист (`Sheet`), toast, лента с действия, поле на форма, индикатори и екрани за грешка и изтекла сесия. `Sheet` стъпва на `sheet-drag.ts` (плъзгане за затваряне) и `sheet-history.ts` (връщане „назад“ затваря листа). Директорията не прави HTTP заявки.

## Interface
- `ActionBar.tsx:ActionBar`, `ActionBar.tsx:Action` — лента с основно и второстепенни действия (`onClick` или `form`)
- `Aurora.tsx:Aurora` — декоративен фон, спира при скрит таб
- `Avatar.tsx:Avatar`, `Avatar.tsx:FAMILY_AVATAR` — кръгъл аватар с инициал и цвят; семейният е „С“ с `person-family`
- `BackLink.tsx:BackLink` — бутон „Назад“ към `/` (kiosk)
- `Card.tsx:Card` — стъклена карта със слотове `title`, `aside`, `action`, `stale`; `interactive` дава фокус-рамка и натискане, `as="a"` с `href` я прави връзка
- `ErrorBox.tsx:ErrorBox` — грешка с „Опитай пак“ или „Презареди“ при изтекла сесия
- `Field.tsx:Field` — етикет, поле и грешка с `aria-invalid`/`aria-describedby`
- `NeedsConnection.tsx:useNeedsConnection` — `disabled`, `describedBy` и `hint` „Иска връзка“ за действия без мрежа
- `SessionExpired.tsx:SessionExpired` — цял екран „Презареди“ за kiosk/TV
- `Sheet.tsx:Sheet` — модален лист (телефон) или прозорец (широк екран); `closeLabel` сменя „Готово“, `hideClose` маха бутона, `focusRef` избира фокуса
- `Spinner.tsx:Spinner`, `Toast.tsx:Toast`, `ToastMessage`, `ToastAction`, `TopBar.tsx:TopBar`, `TopBarSync` — индикатор, съобщение с „Върни“/действие, горна лента с дата и точки за синхронизация (kiosk/TV, `sync`) или аватар на действащия човек (телефон, `avatar`)
- `sheet-drag.ts:useSheetDrag`, `sheet-drag.ts:SHEET_WINDOW_QUERY` — плъзгане надолу; `(min-width: 48rem)` прави листа прозорец
- `sheet-history.ts:useSheetHistory`, `sheet-history.ts:afterSheetClosed`, `sheet-history.ts:restoreScrollBetweenScreens` — запис на листа в историята, действие след затварянето му, `scrollRestoration` за router-а

## Invariants
- `ActionBar.tsx:SPACE_PROPERTY` — една лента на екран: `--action-bar-space` се задава и маха при размонтиране; второстепенните действия се ключват по `label`
- `Toast.tsx:Toast` — 4000 ms (`DURATION_MS`), 8000 ms (`ACTION_DURATION_MS`) с действие; `action` има предимство пред `undo`
- `ErrorBox.tsx:describeError` — само `ApiError` носи свое съобщение; `isSessionExpired()` (401/403 или код `session_expired` при пренасочване) дава „Презареди“; друга грешка е „Няма връзка със сървъра“
- `Sheet.tsx:Sheet` — фокусът се слага само при монтиране (`focusRef` или бутона за затваряне; при `hideClose` без `focusRef` фокусът се слага отвън, от съдържанието); Escape и фонът викат `onClose`
- `sheet-drag.ts:onEnd` — затваря при плъзгане над `CLOSE_FRACTION` = 0.25 от височината или при `FLICK_VELOCITY` = 0.5 px/ms и поне `FLICK_MIN_PX` = 24 px; не работи в режим прозорец и при превъртяно съдържание
- `sheet-history.ts:useSheetHistory` — всеки лист добавя запис с маркер `familySheet`; `history.back()` само ако текущият запис е на този лист; при StrictMode не се добавя втори запис
- `sheet-history.ts:replacePushOverSheet` — докато има отворен лист, `pushState` над него става `replaceState`
- `NeedsConnection.tsx:useNeedsConnection` — `disabled = !online`
- `TopBar.tsx:STATES` — `ok` → ok, `stale`/`failed` → stale, `unconfigured` → off; датата е в `Europe/Sofia`

## Side Effects
- `ActionBar.tsx:ActionBar` — `ResizeObserver`, пише `--action-bar-space` на `documentElement`
- `Aurora.tsx:useDocumentHidden` — слушател за `visibilitychange`
- `ErrorBox.tsx:ErrorBox`, `SessionExpired.tsx:SessionExpired` — `window.location.reload()`; `SessionExpired` слуша `keydown` на `document`
- `Sheet.tsx:Sheet` — `keydown` на `document` за Escape
- `Toast.tsx:Toast` — `setTimeout(onDone)` и портал в `document.body`
- `sheet-drag.ts:useSheetDrag` — touch слушатели на панела, мутира `style.transform`
- `sheet-history.ts:useSheetHistory` — `History.prototype.pushState`, временна подмяна на `window.history.pushState`, `popstate` слушател и `history.back()`

## Verification
- Run: `pnpm --filter web test src/components`
