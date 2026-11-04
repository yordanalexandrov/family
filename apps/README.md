# apps

## Overview

Двете приложения на платформата. `api` е сървърът и единственият писач в Postgres, а `web` е единственият клиент (PWA за телефон, браузър, kiosk и TV). Помежду си говорят само по HTTP (`/api/*` и SSE `/api/events`) и през общите типове от `@family/shared` (`packages/shared`); `apps/web` не внася нищо от `apps/api` и обратно ([docs/architecture.md](../docs/architecture.md)).

## Subdirectories & Boundaries

- api: [api/README.md](api/README.md) - Fastify сървърът: REST `/api/*` зад Cloudflare Access и `/healthz`, Drizzle схема и миграции, собствен cron (синхронизации, Предложение за меню, Напомняния), AI заявки към OpenClaw (`202` + polling) и Известия през Web Push.
- web: [web/README.md](web/README.md) - PWA клиентът: React, TanStack Router/Query, Vite, собствен service worker (`src/sw.ts`); една функционалност на папка в `src/features`, офлайн кеш в localStorage/IndexedDB.
