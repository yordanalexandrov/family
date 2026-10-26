# Shopping list

The week's shopping list is computed from the menu: every ingredient of the planned dinners, scaled to the planned servings and grouped by aisle. Users check items off (shared across devices, works offline), hide computed items, add manual ones and see which dishes an item comes from.

## Sub-features

- `shopping-computed` items from the week's menu, scaled (recipe 4 servings, `лук 2 бр.`, planned 2 → `1 бр.`), grouped in regions by aisle.
- `shopping-check` checkbox per item; paragraph „N от M за купуване“ counts the rest.
- `shopping-hide` „Скрий <item>“ hides a computed item into a collapsed „▸ Скрити (N)“.
- `shopping-sources` „<item>: от кои ястия“ lists the dinners the item comes from.
- `shopping-add` „+ Добави“ sheet adds a manual item (marked img „добавен на ръка“) with „Изтрий <item>“.
- `shopping-empty` a week without a plan shows „Няма меню за тази седмица“ and link „Към менюто“.

## How to get to it (user POV)

- Bottom nav „Пазаруване“ → `/shopping`, tabs „Тази седмица“/„Следваща седмица“.

## Driving it with drive.mjs

Preconditions:

- `setup-phone.mjs`, `recipe-create.mjs` ran, and the week has a plan with that recipe (menu.md → `menu-meal`). `scenarios/menu-to-shopping.mjs` does all of it for next week.

- **Computed list.** `tap` nav link „Пазаруване“, `tap` tab „Следваща седмица“ → region „Плод и зеленчук“ has a listitem with `лук` and `1 бр.`; paragraph „1 от 1 за купуване“.
- **Check.** `tap(getByRole('checkbox', { name: 'лук' }))` → paragraph „0 от 1 за купуване“.
- **Add manual.** `tap` „+ Добави“ → dialog „Добави“; fill textbox „Заглавие“ `кафе`; `selectOption('Напитки')` on combobox „Щанд“; `tap` button „Добави“ (exact) → the dialog closes and region „Напитки“ has checkbox „кафе“.
- **Second view.** `page.reload()`, tab „Следваща седмица“ again → checkbox „лук“ is `checked`. `psql` on `shopping_item` join `shopping_list` join `meal_plan` for the week → `computed | лук | t` and `manual | кафе | drinks | f`. All proven by `scenarios/menu-to-shopping.mjs`.
- **Sources.** `tap(getByRole('button', { name: 'лук: от кои ястия' }))` → dialog „лук“ with paragraph „От кои ястия“ and listitem `понеделник, 2 ноември · <recipe>`; close with Escape.
- **Hide.** `tap(getByRole('button', { name: 'Скрий лук' }))` → region „Плод и зеленчук“ disappears, button „▸ Скрити (1)“ appears, counter excludes it; `psql` shows `hidden = t` for that `item_key`.
- **Empty.** On a week without a plan → paragraph „Няма меню за тази седмица“ and link „Към менюто“.

## Gotchas

- Computed `shopping_item` rows only store state (checked, hidden): `title`, `quantity`, `unit`, `aisle` are null and the name comes from `item_key` = `<ingredient id>:<unit>`; join `ingredient` on that prefix. Manual rows have `item_key` = `manual:<uuid>` and their own `title`/`aisle`.
- A checkbox tap writes immediately; there is no save button. The list refreshes every 15 s and on focus, so a stale screenshot can lag a write by a moment; `see` the counter before shooting.
- The „Добави“ sheet's „Добави“ button saves and closes; „Готово“ only closes without saving.
- Offline checks queue in IndexedDB (in the run's browser profile); to verify, `context.setOffline(true)`, check, `setOffline(false)` and wait for the next refresh; not covered by a shipped scenario yet.
