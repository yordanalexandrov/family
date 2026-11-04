# scripts

## Overview

Ръчни CLI скриптове на API-то (`tsx`), които не са част от `pnpm test`. Седем от тях са smoke тестове срещу истинския OpenClaw gateway: всеки праща вход на един AI контракт през клиента на API-то (`src/openclaw/client.ts`) и печата и проверява отговора. Пускат се преди merge, когато се промени prompt в `docs/openclaw/` или контракт в `packages/shared/src/contracts/` (`docs/openclaw/README.md`). `seed-ingredients.ts` генерира seed миграция за Продуктите.

## Interface

- `suggest-smoke.ts` (`pnpm --filter api suggest:smoke -- --slots … [--times] [--tags] [--hint] [--no-component] [--repeat N] [--save out.json]`) – `recipe.suggest` през агента `family-recipe`.
- `menu-smoke.ts` (`menu:smoke -- [--hint] [--save]`) – `menu.propose` през `family-menu` по fixture `menu-propose.input.json`.
- `meal-smoke.ts` (`meal:smoke -- [--comment] [--save]`) – `meal.replace` през `family-meal` по fixture `meal-replace.input.json`.
- `import-smoke.ts` (`import:smoke -- [--case …] [--repeat N] [--text-file] [--source-url] [--url] [--photo] [--save]`) – `recipe.normalize` през `family-import`: вградени текстове, страници по линк (през `src/services/recipe-page`) и снимки.
- `refine-smoke.ts` (`refine:smoke -- [--recipe] [--url] [--no-source] [--repeat N] [--save]`) – `recipe.refine` през `family-refine`.
- `revise-smoke.ts` (`revise:smoke -- [--case …] [--recipe --instruction] [--repeat N] [--save]`) – `recipe.revise` през `family-revise`.
- `ask-smoke.ts` (`ask:smoke -- [--recipe] [--servings N] [--components] [--step N] [--question …] [--expect] [--chain] [--repeat N] [--save]`) – `cooking.ask` през `family-cook`; входът се строи с `src/services/cooking-questions.ts:cookingAskInput`.
- `seed-ingredients.ts` (`pnpm --filter api db:seed-ingredients -- <tag>`) – записва продуктите от `src/db/seed/ingredients.json`, които още не са в seed миграция, в празната custom миграция `<tag>`.

## Invariants

- Всеки smoke скрипт чете само `OPENCLAW_*` (`src/config.ts:loadOpenClawConfig`). Агентът е `config.recipeAgent`, `config.menuAgent` и т.н.; имената по-горе (`family-recipe` и др.) са само стойностите по подразбиране на `OPENCLAW_*_AGENT`. `ask-smoke.ts` ползва `config.cookTimeoutMs`, останалите `config.timeoutMs`. Без `OPENCLAW_GATEWAY_PASSWORD` клиентът е `null` и скриптът излиза с 2 (напр. `suggest-smoke.ts`).
- Изходни кодове: 2 за грешни аргументи или конфигурация, 1 когато проверка се провали (✗), 0 при успех (`process.exit(failed ? 1 : 0)` в `suggest`, `import`, `refine`, `revise`, `ask`). `menu-smoke.ts` и `meal-smoke.ts` не проверяват очаквания: излизат с 1 само при хвърлена грешка (`catch`), иначе с 0.
- `import-smoke.ts`, `suggest-smoke.ts`, `refine-smoke.ts`, `revise-smoke.ts`, `ask-smoke.ts` – вградените случаи имат очаквания (напр. Компонент там, където трябва, непроменени редове при Поправка, `change` при замяна в Готвене); всяко разминаване е ✗.
- `seed-ingredients.ts` – отказва миграция, която вече има SQL (`isEmptyMigration`): приложена миграция не се пренаписва. Излиза с 0, когато всички продукти вече са в seed миграция.

## Side Effects

- Мрежа: заявки към OpenClaw gateway (`OPENCLAW_URL`). `import-smoke.ts` и `refine-smoke.ts` с `--url` теглят и страниците и снимките на сайтове.
- Файлове: четат `src/db/seed/ingredients.json` и fixtures от `@family/shared/fixtures`; `suggest-smoke.ts` чете Уредите от `drizzle/0023_seed_appliances.sql` (`migrationPath`) и излиза с 2, ако не може да ги разпарсва; `import-smoke.ts --photo/--text-file`, `refine-smoke.ts`, `revise-smoke.ts` и `ask-smoke.ts` с `--recipe` четат локални файлове (`readFile`). `--save out.json` записва отговорите (`writeFile`). `seed-ingredients.ts` пише в `drizzle/<tag>.sql`.
- stdout/stderr; не пишат в базата.

## Verification

- Run: `pnpm --filter api typecheck` (няма specs). Самите smoke: `pnpm --filter api <name>:smoke` по `docs/openclaw/README.md`.
