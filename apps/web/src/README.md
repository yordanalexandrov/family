# src — кодът на клиента

## Overview
Входът на клиента. `main.tsx` прилага запазените тема и ниво на ефектите, слуша за предложение за инсталиране, регистрира обновяването на service worker-а само в production и рендира `App`. `sw.ts` е собственият service worker (Workbox): прекеш, share target, `/api` само от мрежата и Web Push. `logger.ts` е единственото място, което пише в конзолата. Поддиректориите `test/` и `styles/` не са описани тук (тестова инфраструктура и CSS).

## Interface
- `main.tsx` — входна точка без експорти: `applyStoredTheme`, `applyStoredEffects`, `listenForInstallPrompt`, после `createRoot` в `StrictMode`
- `sw.ts` — service worker без експорти: прекеш, `NavigationRoute`, `NetworkOnly` за `/api`, share target, `push`, `notificationclick`, `SKIP_WAITING`
- `logger.ts:logger` — `debug`, `info`, `warn`, `error` с префикс `[family]`
- `env.d.ts:__APP_VERSION__` — глобалната версия от `vite.config.ts`

Поддиректории:
- [api](./api/README.md) — HTTP клиентът `apiFetch`, SSE към `/api/events` и общите заявки.
- [app](./app/README.md) — обвивката: router, QueryClient, настройки на устройството, обновяване, Web Push решения, навигация.
- [components](./components/README.md) — общи UI компоненти (`Sheet`, `Toast`, `Card`, `ActionBar` и др.).
- [lib](./lib/README.md) — форматиране, офлайн кеш, запис на Готвене и малки куки.
- [features](./features/README.md) — функционалностите по екрани.

## Invariants
- `logger.ts:logger.debug` — пише само при `import.meta.env.DEV`
- `main.tsx:registerAppUpdate` — вика се само при `import.meta.env.PROD`; без `#root` хвърля грешка
- `sw.ts:fetch listener` — share target (`isShareTarget`) се поема преди маршрутите на Workbox
- `sw.ts:NavigationRoute` — навигацията се обслужва от `/index.html` с изключение на `^/api/` и `^/healthz`
- `sw.ts:registerRoute` — `/api/*` от същия origin е `NetworkOnly`; `/api/events` (SSE) изобщо не минава през service worker-а
- `sw.ts:message listener` — `skipWaiting()` само при `SKIP_WAITING`; `clientsClaim()` е винаги активен

## Side Effects
- `logger.ts:logger` — `console.debug/info/warn/error`
- `main.tsx` — DOM атрибути на темата/ефектите, слушатели за инсталиране, регистрация на service worker в production
- `sw.ts:precacheAndRoute`, `sw.ts:cleanupOutdatedCaches` — Cache API (Workbox прекеш)
- `sw.ts:fetch listener` — `receiveShare` пази споделена снимка в кеша и пренасочва към `/recipes/import`
- `sw.ts:push listener`, `sw.ts:notificationclick listener` — `showNotification`, `openWindow`, `fetch` към бутоните на известието и към прочитането в кутията, `navigator.setAppBadge` (през `app/push-handlers.ts`)

## Verification
- Run: `pnpm --filter web test`
