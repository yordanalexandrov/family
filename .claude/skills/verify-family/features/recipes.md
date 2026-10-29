# Recipes

The family recipe register: create a recipe with tags, ingredients from the shared product list and steps; find it by search, tag or time and sort by rating; view, rate, edit and archive it. From here the user can also ask the AI for recipe suggestions or import a recipe (recipe-import.md).

## Sub-features

- `recipe-create` new recipe through the form, with an existing ingredient picked from „Съвпадения“.
- `recipe-view` the saved recipe shows title, servings, ingredients grouped by aisle and steps.
- `recipe-search` searchbox „Търси“ and button „Филтри“ (sheet „Филтри“: groups „Етикет“, „Време“, „Подреди“, checkbox „Покажи архивираните“) filter the list; the count above it reads „N рецепти“ or „N от M“, „Изчисти“ drops the filters.
- `recipe-rate` group „Оценка“ on the view: buttons „1 от 5“ … „5 от 5“ (`pressed`).
- `recipe-edit` „Редактирай“ changes and saves an existing recipe.
- `recipe-archive` „Архивирай“ marks it „Архивирана“, turns the button into „Върни“ and hides it from the list unless „Покажи архивираните“ is checked.
- `recipe-new-ingredient` an unknown product name offers „Нов продукт“, which creates a shared ingredient and links the line.
- `suggest-unavailable` „Поискай предложения“ shows the AI-unavailable state in a run.

## How to get to it (user POV)

- Bottom nav „Рецепти“ → `/recipes`; link „Нова рецепта“ (shows „+ Нова“) → `/recipes/new`.
- A recipe link in the list → `/recipes/<id>`; link „Редактирай“ → `/recipes/<id>/edit`.
- Link „Поискай предложения“ → `/recipes/suggest`; link „Внеси“ → `/recipes/import` (recipe-import.md).

## Driving it with drive.mjs

Preconditions:

- `setup-phone.mjs` ran.

- **Create.** Proven by `scenarios/recipe-create.mjs`: „Нова рецепта“; fill textbox „Заглавие“; `tap` tag `вечеря` in group „Тагове“; `tap` „Добави продукт“ → dialog „Продукт“: fill textbox „Продукт“ with `лук`, `tap` button `лук` (exact) in list „Съвпадения“, fill „Количество“ `2`, `selectOption('бр.')` on combobox „Единица“, `tap` „Готово“ → the form shows the line as button „лук · 2 бр.“; a new recipe starts with no steps: `tap` „Добави стъпка“ → dialog „Стъпка“: fill textbox „Стъпка 1“, `tap` „Готово“ → list „Стъпки“ shows the text as a button; `tap` „Запази“ → heading level 1 = title, list „Плод и зеленчук“ has a listitem with `лук` and `2 бр.`, region „Стъпки“ has a listitem with the step text.
- **Search.** `tap` link „← Рецепти“; fill searchbox „Търси“ with the title → a link whose name contains the title.
- **Second view.** `psql` on `recipe` join `recipe_ingredient` join `ingredient` by title → 1 row, `лук`, unit `pcs`.
- **Rate.** On the view `tap(getByRole('group', { name: 'Оценка' }).getByRole('button', { name: '4 от 5' }))` → that button is `pressed`; `psql` → `recipe.rating = 4`.
- **Edit.** On the recipe view `tap(getByRole('link', { name: 'Редактирай' }))` → heading „Редакция“; fill textbox „Порции“ `6`; `tap` „Запази“ → back on the view with text `6 порции`.
- **Archive.** `tap(getByRole('button', { name: 'Архивирай' }))` → button „Върни“ and text „Архивирана“; searching the list no longer shows it until „Филтри“ → `tap(getByRole('checkbox', { name: 'Покажи архивираните' }))` in dialog „Филтри“; „Върни“ on the view restores it. No toast.
- **New ingredient.** On a new recipe `tap` „Добави продукт“; in dialog „Продукт“ fill „Продукт“ with an unseeded name → paragraph „Непознат продукт: избери от списъка или създай нов“; `tap` „Нов продукт“; in group „Нов продукт“ choose combobox „Щанд“, `tap` „Създай“; `tap` „Готово“ → list „Продукти“ shows img „Свързан“; `psql` on `ingredient` by name → one row.
- **Suggestions.** `go('/recipes/suggest')` → heading „Поискай предложения“; `tap` slot `Вечеря` in group „Слот“; `tap` „Поискай предложения“ → alert „AI не е на разположение в момента“ (the api answers `503`). Not verifiable further in a run.

## Gotchas

- „Добави продукт“ opens the line in sheet „Продукт“; target `getByRole('dialog', { name: 'Продукт' })`. A saved line is one button „<продукт> · <количество>“ with img „Свързан“ when linked; tapping it reopens the sheet.
- Steps work the same way: there is no step field in the form, „Добави стъпка“ opens sheet „Стъпка“ (`getByRole('dialog', { name: 'Стъпка' })`) with textbox „Стъпка N“ and buttons „По-нагоре“, „По-надолу“, „Премахни стъпка“, „Готово“. A saved step is a button with its text in list „Стъпки“; a step added and closed empty is dropped.
- The ingredient textbox keeps the typed text even when no match is chosen; only a tapped match links the seed ingredient. `лук` also matches `луканка`, so use `exact: true`.
- Ingredient lines render as one text node (`лук 2 бр.`) in the ARIA tree but separate elements in the DOM; filter the listitem by `hasText` twice instead of `getByText('лук 2 бр.')`.
- Only recipes tagged `вечеря` appear in the menu's meal sheet.
