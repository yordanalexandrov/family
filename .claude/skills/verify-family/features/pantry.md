# Pantry

„Килер“ holds what the household has at home: staples („Постоянни“) that never go on the shopping list, and temporary items („Временни“) waiting to be used up, oldest first. Changes save as you tap; the shopping list reads the pantry (shopping.md → `shopping-pantry`).

## Sub-features

- `pantry-list` regions „Постоянни“ and „Временни“, each with its own empty text („Няма временни продукти.“).
- `pantry-add` „Добави“ → dialog „Добави в килера“: searchbox „Търси продукт“, list „Продукти“ of checkboxes, group „Вид“ (radios „Постоянен“/„Временен“), checkbox „❄️ Във фризера“, textbox „Бележка“, submit „Добави N продукт(а)“.
- `pantry-row` per item: „Във фризера: X“, „Направи временен: X“ / „Направи постоянен: X“, and „Махни: X“ (staple) or „Използвано: X“ (temporary).

## How to get to it (user POV)

- Nav link „Килер“ → `/pantry` (phone and browser only).
- From the shopping list: „Имаме го винаги“ in an item's sources dialog adds a staple.

## Driving it with drive.mjs

Preconditions:

- `setup-phone.mjs` ran.

- **Open.** `tap` nav link „Килер“ → heading level 1 „Килер“, regions „Постоянни“ and „Временни“.
- **Add.** `tap(getByRole('button', { name: 'Добави', exact: true }))`; in dialog „Добави в килера“ fill searchbox „Търси продукт“ `картоф`; `tap(getByRole('checkbox', { name: 'картоф', exact: true }))`; `tap` radio „Временен“; `tap` button `/^Добави 1 продукт/` → region „Временни“ shows `картоф от днес`.
- **Change kind.** `tap` `/^Направи постоянен: картоф/` → it moves to „Постоянни“.
- **Remove.** `tap` `/^Махни: картоф/` → gone; `psql("select i.name, p.kind from pantry_item p join ingredient i on i.id = p.ingredient_id")` no longer lists it.

## Gotchas

- The submit stays „Добави“ `[disabled]` until at least one product is checked; then its name carries the count.
- The product search matches substrings (`картоф` also lists `сладък картоф`); use `exact: true`.
- `pantry_item.kind` is `staple` or `use_up`; `ran_out_at` is set by „Свърши“ on the shopping list.
