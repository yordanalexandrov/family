# web — PWA клиентът

## Overview
Пакетът `web` е PWA клиентът на семейната платформа: React 19, TanStack Router и Query, Vite и `vite-plugin-pwa` (стратегия `injectManifest` със собствен `src/sw.ts`). Целият UI е в [src/](./src/README.md): обвивката и router-ът в `src/app`, общите компоненти в `src/components`, а всеки екран (Табло, Меню, Рецепти, Готвене, Пазаруване, Килер, Календар, Настройки и др.) в своя папка под `src/features`. Директно в тази папка са само конфигурацията на сборката и тестовете, `index.html` с началния екран и тема преди React, `biome.json` с правилата и `tsconfig*.json`. Договорите идват от `packages/shared` (`@family/shared`), а сървърът е `apps/api`. `public/` (икони) не е описан.

## Interface
- `vite.config.ts:default` — конфигурация на build, dev сървъра и vitest; дефинира `__APP_VERSION__` и PWA плъгина
- `vite.config.ts:manifest.share_target` — POST multipart към `/recipes/import` с `title`, `text`, `url` и файл `photo`
- `vite.config.ts:resolve.alias` — `@family/shared` сочи към `packages/shared/src/index.ts`
- `package.json:scripts` — `dev`, `build`, `preview`, `test` (`vitest run`), `typecheck` (`tsc -b`), `lint` (`biome ci .`)
- `index.html` — началният екран в `#root`, вграден скрипт за темата, зарежда `/src/main.tsx`

Поддиректории:
- [src](./src/README.md) — входът (`main.tsx`), service worker-ът (`sw.ts`), `logger.ts` и слоевете на клиента.

## Invariants
- `vite.config.ts:VitePWA` — `registerType: 'prompt'` и `injectRegister: false`: регистрацията е ръчна (`src/app/app-update.ts`), а новата версия чака „Обнови“
- `vite.config.ts:API_PORT` — dev сървърът (порт 5173, `strictPort`) проксира `/api` към `127.0.0.1:API_PORT`, по подразбиране 18091
- `vite.config.ts:APP_VERSION` — версията е от `package.json`, с първите 7 знака на `GIT_SHA`, ако е зададена
- `vite.config.ts:test` — jsdom, setup `src/test/setup.ts`, само `src/**/*.spec.{ts,tsx}`, `testTimeout` 15000
- `biome.json:noConsole` — конзолата е забранена извън `src/logger.ts`
- `biome.json:noRestrictedGlobals` — глобалният `fetch` е забранен извън `src/api/client.ts` и тестовете
- `tsconfig.app.json:exclude` — `src/sw.ts` се проверява отделно от `tsconfig.sw.json` (lib WebWorker)
- `index.html:inline script` — тема от `family.theme`; без валидна стойност `auto` за kiosk/TV, иначе `system`; `auto` е тъмна 20:00–07:00 по `Europe/Sofia`

## Side Effects
- `index.html:inline script` — чете localStorage `family.theme` и `family.deviceMode`; пише `dataset.theme` и `meta[name=theme-color]`
- `vite.config.ts:server.proxy` — dev прокси на `/api`
- `vite.config.ts:VitePWA` — генерира service worker от `src/sw.ts` и web manifest (`start_url` `/`, `display: standalone`, `lang: bg`)

## Verification
- Run: `pnpm --filter web test`
- Типове: `pnpm --filter web typecheck`
- Lint: `pnpm --filter web lint`
