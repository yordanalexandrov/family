# Структура на репото и граници между пакетите

Как е подреден monorepo-то и правилата за пресичане на границите. Прочети това, преди да пипаш повече от един пакет. Общата архитектура (компоненти, роли, AI контракти) е в [concept.md](concept.md#архитектура).

## Карта на пакетите

| Пакет | Технология | Роля |
|---|---|---|
| `apps/web` | React + Vite, PWA (vite-plugin-pwa) | Единствен клиент за телефон, таблет и TV; kiosk изглед за таблета |
| `apps/api` | Fastify + TypeScript + Drizzle | REST/JSON API, auth, бизнес логика, единственият писач в Postgres |
| `packages/shared` | Framework-agnostic TypeScript | Типове, Zod schemas за API и AI контрактите, чисти помощни функции |

Инфраструктура: `docker-compose.yml` (postgres, api, caddy, backup); `api` и `caddy` вървят на host мрежата на Docker само на loopback ([ADR-0005](adr/0005-api-and-caddy-on-host-network.md)). OpenClaw е външен и говори само с api; n8n отсъства във Фаза 1 ([ADR-0001](adr/0001-no-n8n-in-phase-1.md)).

## Правила за границите

- Споделена логика между web и api живее в `packages/shared`, не се дублира локално.
- `packages/shared` не зависи от React, Fastify или Drizzle. Ако нещо иска такава зависимост — не е за там.
- `apps/web` не внася нищо от `apps/api` и обратно. Общият език е `@family/shared` и HTTP.
- Schema на базата (Drizzle) е само в `apps/api`. Клиентът вижда API модели от `shared`, не DB редове.
- Търси символа в целия workspace, преди да добавиш нова абстракция.

## Правило за импорт на shared

Всичко от споделения пакет се внася през alias-а, никога по относителен път през границата:

```typescript
import { mealPlanSchema, type MealPlan } from '@family/shared';
```

В dev и тестове (`tsx`, Vitest, Vite) alias-ът сочи към `packages/shared/src` (tsconfig `paths` / Vite `resolve.alias`), затова shared не се build-ва предварително. Production build-овете (`tsc -b` в api, `node dist/server.js`) го резолвват през `exports` на пакета към `packages/shared/dist`, който `pnpm build` произвежда първи.

## Слоеве в `apps/api`

```
routes/      → Fastify plugins; валидират вход/изход със schema от shared, викат service
services/    → бизнес логика (меню → списък за пазаруване и т.н.); без HTTP детайли
db/          → Drizzle schema, миграции, repository функции
```

Route-ът не пипа базата директно; service-ът не знае за request/reply.

## Слоеве в `apps/web`

```
app/              → композиция: code-based маршрути (TanStack Router), QueryClient, действащ потребител (localStorage), тема
features/<име>/   → екран + hooks + компоненти за една функционалност (who, home; после dashboard, menu, shopping, recipes)
api/              → един HTTP клиент (`client.ts`: `/api`, `X-Acting-User`, Zod, `ApiError`) + TanStack Query hooks (`queries.ts`)
components/       → споделени UI компоненти без бизнес логика (Avatar, Spinner, ErrorBox)
styles/           → design tokens (`tokens.css`, `data-theme`) и глобални стилове
logger.ts         → единственият изход към конзолата
```

Компонентите не викат `fetch` директно, а hooks от `features/*` или `api/`. Root layout-ът праща към `/who`, докато устройството няма действащ потребител.

## Вижте също

- [Конвенции](conventions.md)
- [Тестване](testing.md)
