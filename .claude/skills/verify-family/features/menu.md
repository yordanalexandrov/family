# Weekly menu

The week's dinners: start an empty plan (or ask the AI to propose one), then pick a recipe, a cook and per-person servings for each day. Past weeks are read-only; kiosk shows the menu read-only.

## Sub-features

- `menu-empty` „Започни празно“ creates a plan of 7 dinners „Избери ястие Без готвач 2 порции“.
- `menu-meal` the meal sheet sets recipe, cook and servings for one day. Above them: group „Гласове“, the meal's thread, „Избери сам“ (the registry picker) and „✨ Предложи друго“.
- `menu-note` a note instead of a recipe („напр. ядем навън“) with „Запази“.
- `menu-weeks` tabs „Тази седмица“/„Следваща седмица“ and button „Предишна седмица“.
- `menu-propose-unavailable` „Предложи меню“ shows alert „AI не е наличен в момента“ in a run.

## How to get to it (user POV)

- Bottom nav „Меню“ → `/menu`.
- Dashboard link „Днес се готви …“ → `/menu`.
- Shopping list with no plan → link „Към менюто“.

## Driving it with drive.mjs

Preconditions:

- `setup-phone.mjs` and `recipe-create.mjs` ran (a recipe tagged `вечеря` exists).
- The chosen week has no plan yet.

- **Empty plan.** Proven by `scenarios/menu-to-shopping.mjs`: `go('/menu')`; `tap` tab „Следваща седмица“; `tap` „Започни празно“ → list „Вечери“ with 7 buttons containing „Избери ястие“.
- **Pick a dinner.** Proven by `scenarios/menu-to-shopping.mjs`: `tap` the first button of list „Вечери“ (each row also has vote buttons „Против“/„За“ after it) → dialog named after the day (e.g. „понеделник, 2 ноември“). `tap` „Избери сам“ (the searchbox is hidden until then), fill searchbox „Търси рецепта“, `tap` the recipe in list „Вечерни рецепти“ (it becomes `[pressed]`), `tap` „Дани“ in group „Готвач“, `tap` „Готово“ → the row reads `<day> <recipe> Дани избра „<recipe>“ 1 в разговора Готви Дани 2 порции`; match it with `new RegExp(`${title} .*Готви Дани 2 порции`)`. Picking also casts the acting user's „За“ vote.
- **Servings.** In the dialog's group „Порции“, `tap` „Повече порции за Дани“ → status „Порции за Дани“ goes from `1` to `2`; the row shows `3 порции`.
- **Second view.** `psql("select m.date, r.title, m.cook_user_id, m.servings from meal m join recipe r on r.id = m.recipe_id")`, or the shopping list for that week (shopping.md).
- **AI proposal.** On a week without a plan `tap` „Предложи меню“ → alert „AI не е наличен в момента“; the plan is not created. Not verifiable further in a run.

## Gotchas

- „Започни празно“ exists only while the week has no plan; in a run a week can be started once.
- 404 in `network.log` on `GET /api/menu/plans?weekStart=…`, `/api/menu/proposals?weekStart=…` or `/api/shopping-lists/<week>` means „no plan/proposal/list for that week“, not an error.
- The sheet's recipe list shows only `вечеря`-tagged recipes; an untagged recipe gives „Няма такава рецепта.“
- Changes in the sheet save as you tap; „Готово“ only closes it. The note's „Запази“ is separate and stays disabled until a note is typed.
