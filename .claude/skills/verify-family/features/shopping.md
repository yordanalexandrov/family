# Shopping list

The week's shopping list is computed from the menu: every ingredient of the planned dinners, scaled to the planned servings, rounded up and grouped by aisle, minus what the pantry („Килер“) always has. Users check items off (shared across devices, works offline), hide computed items, add manual ones and see which dishes an item comes from.

## Sub-features

- `shopping-computed` items from the week's menu, scaled (recipe 4 servings, `лук 2 бр.`, planned 2 → `1 бр.`, planned 3 → `2 бр.`), grouped in regions by aisle.
- `shopping-check` the whole row is the check target (label for the big checkbox on the right); paragraph „N от M за купуване“ counts the rest. A checked row stays in place, struck through, and drops to the end of its aisle 1.5 s after the last touch in the list.
- `shopping-hide` „Скрий от списъка“ in the row sheet hides a computed item into a collapsed „Скрити (N)“; inside it „Покажи <item>“ brings it back.
- `shopping-sources` the ⓘ button „Още за <item>“ (left of the checkbox) opens the row sheet: „От кои ястия“ with the dinners, „Скрий от списъка“, „Имаме го винаги“ (makes it a pantry staple).
- `shopping-pantry` staples go into „🏠 Скрити от килера: N“; „Свърши <item>“ puts one back on the list with badge „свърши“; checking it clears the run-out mark.
- `shopping-add` „+ Добави“ sheet adds a manual item (Заглавие, Количество, Единица, Щанд), marked img „добавен на ръка“; its row sheet has „Изтрий“, which asks in alertdialog „Изтриване на <item>“.
- `shopping-offline` a check made offline waits in a queue. The sync icon, always at the right of „N от M за купуване“, shows it: button „Всички отметки са изпратени“ (muted, no number); unsent checks → badge with the count, name „N отметка/и чака/т връзка“ (online only after ~800 ms); offline → struck-through cloud, name „Няма връзка · …“. Tapping it shows a status „… ще се изпрати/ят сам/и.“ and, online, sends right away.
- `shopping-empty` a week without a plan shows „Няма меню за тази седмица“ and link „Към менюто“.

## How to get to it (user POV)

- Nav link „Пазаруване“ → `/shopping`, tabs „Тази седмица“/„Следваща седмица“.

## Driving it with drive.mjs

Preconditions:

- `setup-phone.mjs`, `recipe-create.mjs` ran, and the week has a plan with that recipe (menu.md → `menu-meal`). `scenarios/menu-to-shopping.mjs` does all of it for next week.

- **Computed list.** `tap` nav link „Пазаруване“, `tap` tab „Следваща седмица“ → region „Плод и зеленчук“ has a listitem with `лук` and `1 бр.`; paragraph „1 от 1 за купуване“.
- **Check.** `tap(getByRole('checkbox', { name: 'лук' }))` → paragraph „0 от 1 за купуване“.
- **Add manual.** `tap` „+ Добави“ → dialog „Добави“; fill textbox „Заглавие“ `кафе`; optionally textbox „Количество“ and combobox „Единица“; `selectOption('Напитки')` on combobox „Щанд“; `tap` button „Добави“ (exact) → the dialog closes and region „Напитки“ has checkbox „кафе“.
- **Delete manual.** `tap` „Още за кафе“ → in dialog „кафе“ `tap` „Изтрий“ → alertdialog „Изтриване на кафе“ → `tap` „Изтрий“ → the checkbox is gone.
- **Second view.** `page.reload()`, tab „Следваща седмица“ again → checkbox „лук“ is `checked`. `psql` on `shopping_item` join `shopping_list` join `meal_plan` for the week → `computed | лук | t` and `manual | кафе | drinks | f` (checked = `checked_by is not null`). All proven by `scenarios/menu-to-shopping.mjs`.
- **Sources.** `tap(getByRole('button', { name: 'Още за лук' }))` → dialog „лук“ with paragraph „От кои ястия“ and listitem `понеделник, 2 ноември · <recipe>`; close with Escape.
- **Hide.** `tap(getByRole('button', { name: 'Още за лук' }))`, `tap` „Скрий от списъка“ → button `/Скрити \(1\)/` appears and the counter excludes it; `psql` shows `hidden = t` for that `item_key`. `tap` it, then „Покажи лук“ → back on the list.
- **Pantry.** With „лук“ unchecked: row sheet „Още за лук“ → `tap` „Имаме го винаги“ → button `/Скрити от килера: 1/`; `tap` it, `tap` „Свърши лук“ → checkbox „лук“ is back with text „свърши“; `psql` on `pantry_item` → `staple`, `ran_out_at` set; check „лук“ → `ran_out_at` null.
- **Offline.** `context.setOffline(true)` and dispatch `offline` on `window`; tap a checkbox → button `/Няма връзка · 1 отметка чака връзка/`; `context.setOffline(false)` + `online` event → button „Всички отметки са изпратени“ within the 15 s refresh.
- **Empty.** Tab „Тази седмица“ without a plan → paragraph „Няма меню за тази седмица“ and `getByRole('main').getByRole('link', { name: 'Към менюто' })`.

## Gotchas

- Computed `shopping_item` rows only store state (`checked_by`/`checked_at`, `hidden`): `title`, `quantity`, `unit`, `aisle` are null and the name comes from `item_key` = `<ingredient id>:<unit>`; join `ingredient` on that prefix. Manual rows have `item_key` = `manual:<uuid>` and their own `title`/`aisle`.
- A pantry staple that is checked stays on the list; uncheck it before expecting it under „Скрити от килера“.
- A checkbox tap writes immediately; there is no save button. The list refreshes every 15 s and on focus, so a stale screenshot can lag a write by a moment; `see` the counter before shooting.
- The „Добави“ sheet's „Добави“ button saves and closes; „Готово“ only closes without saving.
- While the plan is not agreed a status banner „Менюто още не е съгласувано: N ястия чакат.“ adds a second link „Към менюто“; scope link lookups.
- „▸“ in „▸ Скрити (N)“ is part of the accessible name; match with a regex.
- `GET /api/shopping-lists/<week>` answers 404 for a week without a plan; that is not an error.
