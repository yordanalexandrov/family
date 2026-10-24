# Структура на репото и граници между пакетите

Как е подреден monorepo-то и правилата за пресичане на границите. Прочети това, преди да пипаш повече от един пакет. Общата архитектура (компоненти, роли, AI контракти) е в [concept.md](concept.md#архитектура).

## Карта на пакетите

| Пакет | Технология | Роля |
|---|---|---|
| `apps/web` | React + Vite, PWA (vite-plugin-pwa) | Единствен клиент за телефон, таблет и TV; kiosk изглед за таблета |
| `apps/api` | Fastify + TypeScript + Drizzle | REST/JSON API, auth, бизнес логика, единственият писач в Postgres |
| `packages/shared` | Framework-agnostic TypeScript | Типове, Zod schemas за API и AI контрактите, чисти помощни функции |

Инфраструктура: `docker-compose.yml` (api, postgres, caddy), n8n и OpenClaw са външни и говорят само с api.

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

## Слоеве в `apps/api`

```
routes/      → Fastify plugins; валидират вход/изход със schema от shared, викат service
services/    → бизнес логика (меню → списък за пазаруване и т.н.); без HTTP детайли
db/          → Drizzle schema, миграции, repository функции
```

Route-ът не пипа базата директно; service-ът не знае за request/reply.

## Слоеве в `apps/web`

```
features/<име>/   → екран + hooks + компоненти за една функционалност (dashboard, menu, shopping, recipes)
api/              → един HTTP клиент; всички заявки минават през него
components/       → споделени UI компоненти без бизнес логика
```

Компонентите не викат `fetch` директно, а hooks от `features/*` или `api/`.

## Вижте също

- [Конвенции](conventions.md)
- [Тестване](testing.md)
