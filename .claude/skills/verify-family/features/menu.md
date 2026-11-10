# Weekly menu

The week's dinners: start an empty plan (or ask the AI to propose one), then pick a recipe, a cook and per-person servings for each day, vote and talk about each dinner until the week is agreed. Past weeks are read-only; kiosk and TV show the menu read-only.

## Sub-features

- `menu-empty` „Започни празно“ creates a plan of 7 dinners „Избери ястие Без готвач N порции“ (one serving per user, so 2 with the seed users).
- `menu-meal` the meal sheet is an overview of rows (spec #366): heading with the title (a link to the recipe; „Още няма ястие“ on an empty day) and „защо“; group „Става ли за теб?“ with big „Не“/„Да“ until the acting user voted, else group „Гласове“ (both votes, the outcome, small „Не“/„Да“); then buttons „Разговор …“, „Готвач …“, „Порции …“ (`3 (Дани 2, Поли 1)`), switch „В списъка за пазаруване“ and „↻ Смени ястието“. Each button opens a sub-view (`region` named „Разговор“/„Готвач“/„Порции“/„Смени ястието“) with „Назад“; the sub-view is a history entry, so browser back returns to the overview and a second back closes the sheet. „Смени ястието“: „✨ Предложи друго“, „Избери от рецептите“ (the registry picker), „Размени с друг ден“ (group „Размени с“), „Бележка вместо ястие“ (`aria-expanded`, each unfolds in place) and, apart and red, „Махни ястието от деня“. An empty day has `region` „Какво ще ядем?“ with „✨ Предложи ястие“ and the other three instead of the votes and „Смени ястието“. A pick, a swap, a note or a cook returns to the overview. After a pick, a note or a swap the overview has `status` under the title for ~8 s: „✓ Сменено (беше „<old title>“)“ (only „✓ Сменено“ on an empty day or when the title stays the same); after a recipe pick it has button „Върни“, which restores the recipe, „защо“ and both votes (409 → `alert`).
- `menu-shopping` switch „В списъка за пазаруване“ (`role="switch"`) in the sheet of a meal with a recipe adds it to the week's shopping list (checked; unchecking takes it out). Only meals added this way are in the list (ADR-0011); their row in list „Вечери“ shows a small 🛒 (`img` „в списъка за пазаруване“). A new recipe (by hand, „✨ Предложи друго“ or „Махни ястието от деня“) takes the meal out, and „Върни“ does not bring it back; servings and the day keep it.
- `menu-thread` in the sheet's „Разговор“ sub-view, textbox „Коментар“ + „Изпрати“ adds a line to list „Разговор“; the sheet's row and the week's row show the last line and „N в разговора“.
- `menu-note` „Бележка вместо ястие“ (in „Смени ястието“, or in „Какво ще ядем?“ on an empty day) unfolds textbox „Бележка“ (e.g. „ядем навън“) with „Запази“.
- `menu-filter` tablist „Филтър“ (Всички, Да поговорим N, За смяна N, Чака глас N) while the week is not agreed.
- `menu-weeks` tabs „Тази седмица“/„Следваща седмица“, button „Предишна седмица“, any week through `/menu?week=<monday>`.
- `menu-delete` „Изтрий плана“ (only before the week starts) → alertdialog „Изтриване“ → „Изтрий“.
- `menu-propose-unavailable` „Предложи меню“ and „✨ Предложи друго“ show alert „AI не е на разположение в момента“ in a run.

## How to get to it (user POV)

- Nav link „Меню“ → `/menu`.
- Dashboard link „Днес се готви …“ → `/menu` when today's dinner has no recipe (phone and kiosk).
- Shopping list: link „Към менюто“ (empty week, or the „Менюто още не е съгласувано“ banner).

## Driving it with drive.mjs

Preconditions:

- `setup-phone.mjs` and `recipe-create.mjs` ran (a recipe tagged `вечеря` exists).
- The chosen week has no plan yet (for `menu-empty`).

- **Empty plan.** Proven by `scenarios/menu-to-shopping.mjs`: `go('/menu')`; `tap` tab „Следваща седмица“; `tap` „Започни празно“ → list „Вечери“ with 7 buttons containing „Избери ястие“.
- **Pick a dinner.** Proven by `scenarios/menu-to-shopping.mjs`: `tap` the first button of list „Вечери“ (each row also has vote buttons „Не“/„Да“ after it) → dialog named after the day (e.g. „понеделник, 2 ноември“). On an empty day, in region „Какво ще ядем?“ `tap` „Избери от рецептите“ (on a day with a recipe: „↻ Смени ястието“ first), fill searchbox „Търси рецепта“, `tap` the recipe in list „Вечерни рецепти“ → back on the overview with link `<recipe>`. `tap` button `/^Готвач/`, then „Дани“ in group „Готвач“ → back on the overview, row „Готвач Дани“. `tap` „Готово“ → the row reads `пн 2 ноември <recipe> Дани избра „<recipe>“ 1 в разговора Готви Дани 2 порции`; match it with `new RegExp(`${title} .*Готви Дани 2 порции`)`. Picking also casts the acting user's „Да“ vote.
- **Servings.** `tap` button `/^Порции/`; in group „Порции“, `tap` „Повече порции за Дани“ → status „Порции за Дани“ goes from `1` to `2` (the sub-view stays open); „Назад“ → row „Порции 3 (Дани 2, Поли 1)“; the week's row shows `3 порции`.
- **Thread.** `tap` button `/^Разговор/`, fill textbox „Коментар“, `tap` „Изпрати“ → list „Разговор“ shows `Дани: <text>`; after „Готово“ the row reads `… Дани: <text> 2 в разговора Готви …`.
- **Note.** Open an empty row, `tap` „Бележка вместо ястие“, fill textbox „Бележка“, `tap` „Запази“ → back on the overview with heading `<note>`; `tap` „Готово“ → the row's name contains the note.
- **Filter.** With a plan that is not agreed, `see(getByRole('tablist', { name: 'Филтър' }))`; tab „Всички“ is selected.
- **Delete plan.** `go('/menu?week=<a future monday>')`; „Започни празно“; `tap` „Изтрий плана“; in alertdialog „Изтриване“ `tap` „Изтрий“ → „Започни празно“ is back.
- **Add to the shopping list** (`menu-shopping`). Proven by `scenarios/menu-to-shopping.mjs`: in the meal's dialog (a meal with a recipe; a note-only meal has no switch) `tap` switch „В списъка за пазаруване“ → it becomes `[checked]`; tapping it again takes the meal out. Offline it is disabled with „Иска връзка“. A row lands in `shopping_meal`. After „Готово“ the row in „Вечери“ contains `img` „в списъка за пазаруване“ (🛒 after the title); its accessible name reads `… <recipe> в списъка за пазаруване …`.
- **Second view.** `psql("select m.date, r.title, m.note, m.cook_user_id, m.servings from meal m left join recipe r on r.id = m.recipe_id join meal_plan p on p.id = m.plan_id where p.week_start = '<monday>'")`, or the shopping list for that week (shopping.md).
- **AI unavailable.** On a week without a plan `tap` „Предложи меню“ → alert „AI не е на разположение в момента“ and the plan is not created. In the meal sheet `tap` „↻ Смени ястието“ → „✨ Предложи друго“ (on an empty day „✨ Предложи ястие“) → the same alert (`503` on `/api/menu/meals/<id>/replacements`). Not verifiable further in a run.

## Gotchas

- „Започни празно“ exists only while the week has no plan; on next week it can be started once per run. „Изтрий плана“ shows only for weeks that have not started, so use `?week=` two weeks ahead for a repeatable delete.
- 404 in `network.log` on `GET /api/menu/plans?weekStart=…`, `/api/menu/proposals?weekStart=…` or `/api/shopping-lists/<week>` means „no plan/proposal/list for that week“, not an error.
- The sheet's recipe list shows only `вечеря`-tagged recipes; an untagged recipe gives „Няма такава рецепта.“
- Changes in the sheet save as you tap; „Готово“ only closes it. The note's „Запази“ is separate and stays disabled until the note text changes.
- The row's middle text is the last thread line, so after a comment it no longer reads „Дани избра …“; anchor regexes on the title and „Готви …“.
- The `meal` table links to the plan through `plan_id`; `servings` is jsonb per user.
