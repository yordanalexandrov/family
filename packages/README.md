# packages

## Overview

Общите пакети на монорепото. Засега е само `@family/shared`: схемите на API-то, AI контрактите и чистата домейн логика, които ползват и `apps/api`, и `apps/web`. Той не зависи от React, Fastify или Drizzle ([docs/architecture.md](../docs/architecture.md)).

## Subdirectories & Boundaries

- shared: [shared/README.md](shared/README.md) - пакетът `@family/shared`: zod схемите на HTTP API-то, AI контрактите с OpenClaw агентите, сигналите на `GET /api/events` и чиста логика за храна, меню, пазаруване и табло; без странични ефекти.
