# Recipes

The family recipe register: create a recipe with tags, ingredients from the shared product list and steps; find it by search or tag; view, edit and archive it. From here the user can also ask the AI for recipe suggestions.

## Sub-features

- `recipe-create` new recipe through the form, with an existing ingredient picked from „Съвпадения“.
- `recipe-view` the saved recipe shows title, servings, ingredients grouped by aisle and steps.
- `recipe-search` searchbox „Търси“ and tag group „Таг“ filter the list.
- `recipe-edit` „Редактирай“ changes and saves an existing recipe.
- `recipe-archive` „Архивирай“ hides it unless „Покажи архивираните“ is checked.
- `recipe-new-ingredient` an unknown product name offers creating a new ingredient.
- `suggest-unavailable` „Поискай предложения“ shows the AI-unavailable state in a run.

## How to get to it (user POV)

- Bottom nav „Рецепти“ → `/recipes`; link „Нова рецепта“ → `/recipes/new`.
- A recipe link in the list → `/recipes/<id>`; link „Редактирай“ → `/recipes/<id>/edit`.
- Link „Поискай предложение“ → `/recipes/suggest`.

## Driving it with drive.mjs

Preconditions:

- `setup-phone.mjs` ran.

- **Create.** Proven by `scenarios/recipe-create.mjs`: „Нова рецепта“; fill textbox „Заглавие“; `tap` tag `вечеря` in group „Тагове“; `tap` „Добави продукт“; in group „Продукт 1“ fill textbox „Продукт“ with `лук`, `tap` button `лук` (exact) in list „Съвпадения“, fill „Количество“ `2`, `selectOption('бр.')` on combobox „Единица“; fill „Стъпка 1“; `tap` „Запази“ → heading level 1 = title, list „Плод и зеленчук“ has a listitem with `лук` and `2 бр.`.
- **Search.** `tap` link „← Рецепти“; fill searchbox „Търси“ with the title → a link whose name contains the title.
- **Second view.** `psql` on `recipe` join `recipe_ingredient` join `ingredient` by title → 1 row, `лук`, unit `pcs`.
- **Edit.** On the recipe view `tap(getByRole('link', { name: 'Редактирай' }))`; change a field; `tap` „Запази“ → back on the view with the change.
- **Archive.** `tap(getByRole('button', { name: 'Архивирай' }))`; the list no longer shows it until `tap(getByRole('checkbox', { name: 'Покажи архивираните' }))`.
- **New ingredient.** Type a name that is not seeded into „Продукт“ → paragraph „Непознат продукт: избери от списъка или създай нов“; follow the offered create form.
- **Suggestions.** `go('/recipes/suggest')`; `tap` slot `Вечеря` in group „Слот“; `tap` „Поискай предложения“ → expect the AI-unavailable message (the api answers `503 openclaw_unavailable`). Not verifiable further in a run.

## Gotchas

- „Добави продукт“ does not move focus into the new row; target `getByRole('group', { name: 'Продукт N' })`.
- The ingredient textbox keeps the typed text even when no match is chosen; only a tapped match links the seed ingredient. `лук` also matches `луканка`, so use `exact: true`.
- Ingredient lines render as one text node (`лук 2 бр.`) in the ARIA tree but separate elements in the DOM; filter the listitem by `hasText` twice instead of `getByText('лук 2 бр.')`.
- Only recipes tagged `вечеря` appear in the menu's meal sheet.
