# app — обвивката на приложението

## Overview
Обвивката на PWA-то: коренът `App` (QueryClient, SSE, таймери, router), TanStack Router с root layout, който решава кой екран се вижда според режима на устройството и действащия потребител, и `QueryClient` с общата обработка на грешки. Тук са и настройките на устройството в localStorage (режим, действащ потребител, тема, ниво на ефектите) през общия `storedSetting`, платформените куки (wake lock, екранна клавиатура, инсталиране, обновяване на service worker-а), чистите решения за Web Push, които ползва `sw.ts`, и общата навигация.

## Interface
- `App.tsx:App` — корен: `QueryClientProvider`, `ServerEvents` (`useServerEvents` + `usePushFollowsActingUser`), `TimersProvider` над `RouterProvider`
- `router.tsx:createAppRouter`, `router.tsx:AppRouter` — router-ът и типът му; пътища `/`, `/calendar`, `/settings`, `/who`, `/device`, `/recipes`, `/recipes/new`, `/recipes/$id`, `/recipes/$id/edit`, `/recipes/$id/cook`, `/menu`, `/shopping`, `/pantry`, `/recipes/suggest`, `/recipes/suggest/$requestId`, `/recipes/suggest/$requestId/$suggestionId`, `/recipes/import`, `/recipes/import/$requestId` и само в dev `/dev/glass`
- `query-client.ts:createQueryClient` — `QueryClient` с `QueryCache.onError` и подаваем `retry`
- `stored-setting.ts:storedSetting` — фабрика `{read, write, notify, subscribe}` за настройка в localStorage, за `useSyncExternalStore`
- `device-mode.ts:DeviceMode`, `DEVICE_MODES`, `parseDeviceMode`, `isPersonalDevice`, `isInteractiveDevice`, `readDeviceMode`, `useDeviceMode` — режим на устройството `phone | browser | kiosk | tv`
- `acting-user.ts:readActingUserId`, `clearActingUserId`, `useActingUser`, `readWritingUserId`, `useWritingUserId` — действащ потребител; `readWritingUserId` е стойността за `X-Acting-User`
- `theme.ts:ThemeSetting`, `defaultTheme`, `applyStoredTheme`, `useTheme`, `useAutoTheme` — тема `light | dark | system | auto`
- `effects.ts:EffectsLevel`, `EffectsSetting`, `supportsBlur`, `applyStoredEffects`, `useEffectsLevel` — изчисленото ниво `full | lite` и настройката `full | lite | auto`
- `app-update.ts:registerAppUpdate`, `startAppUpdate`, `useAppUpdate`, `HIDDEN_RELOAD_MS` — следене и прилагане на нова версия; `UpdateBar.tsx:UpdateBar` — лентата „Има нова версия · Обнови“
- `install-prompt.ts:listenForInstallPrompt`, `useInstallPrompt` — пази `beforeinstallprompt` и дава `{standalone, accepted, install}`
- `keyboard.ts:useKeyboardInset`, `wake-lock.ts:useWakeLock` — височина на екранната клавиатура и screen wake lock
- `app-badge.ts:AppBadge`, `canBadge`, `showAppBadge` — Badging API върху `navigator` на приложението и на service worker-а; без поддръжка или при отказ нищо
- `push-handlers.ts:onPush`, `onNotificationClick`, `PushWorker`, `PushData`, `AppWindow`, `NotificationShowOptions`, `ShownNotification` — чисти решения за `push` и `notificationclick` и типовете им, ползвани от `../sw.ts`
- `theme.ts:THEME_KEY`, `THEME_BACKGROUNDS`, `device-mode.ts:DEVICE_MODE_KEY`, `acting-user.ts:ACTING_USER_KEY`, `effects.ts:EFFECTS_KEY` — ключовете в localStorage; `THEME_BACKGROUNDS` са цветовете за `theme-color` по тема
- `MainNav.tsx:MainNav`, `ScreenHeader.tsx:ScreenHeader`, `ActingUserAvatar.tsx:ActingUserAvatar`, `ActingUserAvatar.tsx:ActingUserToast` — навигация, заглавна част (с камбанката `InboxBell` от `features/inbox`) и аватар на действащия потребител
- `IdleReturn.tsx:IdleReturn`, `IDLE_RETURN_MS`, `COOKING_IDLE_RETURN_MS` — автоматично връщане към дашборда в kiosk изглед

## Invariants
- `router.tsx:Screen` — `/device` винаги е достъпен; без режим всичко друго пренасочва с replace към `/device`; на `phone`/`browser` без действащ потребител пренасочва към `/who`; kiosk и TV не искат потребител
- `router.tsx:RootLayout` — валиден `?device=` в адреса само записва режима (`ApplyDeviceQuery`) и маха параметъра с replace навигация
- `router.tsx:Screen` — `MainNav` е горе в `browser` (и в Готвене), долу в `phone` без Готвене (`COOKING_PATH`), а в kiosk и TV я няма; `IdleReturn` се монтира само в kiosk и не на `/`
- `router.tsx:RootLayout` — `useWakeLock` само при `kiosk` или `tv`
- `device-mode.ts:isPersonalDevice` — личен е само `phone`/`browser`; `isInteractiveDevice` — всичко освен `null` и `tv`
- `acting-user.ts:readWritingUserId` — на kiosk и TV винаги `null`, дори да е останал запис
- `stored-setting.ts:storedSetting.write` — стойност `unset` маха ключа; при недостъпен localStorage `read` връща `parse(null)`, а `write` само логва
- `query-client.ts:defaultRetry` — 4xx `ApiError` не се повтаря, иначе най-много един повторен опит
- `query-client.ts:createQueryClient` — `ApiError.isUnknownActingUser()` от коя да е заявка чисти действащия потребител; 409 `menu_reworking` от коя да е мутация инвалидира `menuKeys.weekReworks`, за да се види лентата на преработката
- `theme.ts:defaultTheme` — без режим или на личен режим подразбирането е `system`, на kiosk/TV `auto`; `auto` ползва `themeForHour` от `@family/shared`
- `effects.ts:resolveLevel` — без `backdrop-filter` нивото е винаги `lite`; `auto` дава `lite` при `prefers-reduced-motion`
- `app-update.ts:startAppUpdate` — новата версия е налична само при чакащ worker и съществуващ `controller`; презарежда само след поискано прилагане; сама се прилага при връщане на екрана след >= 5 мин скрит и без незаписана работа (`hasUnsavedWork`)
- `push-handlers.ts:onPush` — бройката `unread` от payload-а отива върху иконата и когато известието не се показва; невалиден payload не показва нищо; `menu` не се показва при видим и фокусиран прозорец; `thaw`, `cook` и `test` винаги се показват
- `push-handlers.ts:readInboxItem` — с `inboxId` и тялото, и бутонът правят записа прочетен (`POST /api/inbox/:id/read` с `x-acting-user`) успоредно с отговора, после бройката от `GET /api/inbox/unread-count` отива върху иконата (само с Badging API); грешка само се логва
- `push-handlers.ts:confirmCook` — отговорът на `cook` известие винаги показва резултат (записано, `cook_taken` или грешка) със същия `tag`
- `IdleReturn.tsx:IDLE_RETURN_MS` — 60 s извън дашборда, 2 часа (`COOKING_IDLE_RETURN_MS`) в Готвене; в Готвене спира, докато има активен таймер (`isActiveTimer`); извън Готвене таймерите не го задържат
- `MainNav.tsx:MainNav` — при невидяно предложение (`useUnseenProposalWeek`) „Меню“ има точка и води към седмицата му (`search: { week }`)
- `keyboard.ts:KEYBOARD_MIN_HEIGHT` — клавиатурата е отворена при разлика > 150 px; долната `MainNav` тогава се скрива

## Side Effects
- `stored-setting.ts:storedSetting` — localStorage и слушател за `storage` на `window`; ключове `family.deviceMode` (`device-mode.ts`), `family.actingUserId` (`acting-user.ts`), `family.theme` (`theme.ts`), `family.effects` (`effects.ts`)
- `theme.ts:applyStoredTheme` — пише `document.documentElement.dataset.theme` и `<meta name="theme-color">`; `useAutoTheme` — `setInterval` 60 s и `matchMedia('(prefers-color-scheme: dark)')`
- `effects.ts:apply` — пише `document.documentElement.dataset.effects`; слуша `prefers-reduced-motion`
- `router.tsx:RootLayout` — пише/трие `document.documentElement.dataset.device`
- `query-client.ts:createQueryClient` — `clearActingUserId()` и `logger.warn` при грешка на заявка
- `app-update.ts:registerAppUpdate` — `navigator.serviceWorker.register('/sw.js', {scope: '/'})` след `load`; `postMessage({type: 'SKIP_WAITING'})`, `registration.update()`, `window.location.reload()` след `controllerchange`
- `install-prompt.ts:listenForInstallPrompt` — слушатели за `beforeinstallprompt` (с `preventDefault`) и `appinstalled`
- `wake-lock.ts:useWakeLock` — `navigator.wakeLock.request('screen')`, повторно при `visibilitychange`
- `push-handlers.ts:answer` — POST към `button.post` от payload-а със заглавие `x-acting-user` и `redirect: 'manual'`; `show` — `showNotification`; `openApp` — фокус/навигация на прозорец или `openWindow`
- `IdleReturn.tsx:IdleReturn` — `setTimeout` и `pointerdown` на `document`; `navigate({to: '/'})`
- `MainNav.tsx:MainNav` — CSS променлива `--bottom-nav-space` на `documentElement`; `keyboard.ts:useKeyboardInset` слуша `visualViewport`

## Verification
- Run: `pnpm --filter web test src/app`
