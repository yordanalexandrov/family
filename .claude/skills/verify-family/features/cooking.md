# Cooking

Готвене for one recipe, laid out for a wide screen (kiosk and browser in landscape): column „Продукти“ on the left with servings −/+ and the scaled amounts, one step on the right with „Стъпка X от N“, „Назад“/„Напред“, a dot per step and swipe. „Готово“ on the last step and „Затвори“ on any step go back to the previous screen. Nothing is written.

## Sub-features

- `cooking-entry` link „Готви“ on the recipe view (kiosk, phone, browser; not TV) opens `/recipes/<id>/cook`.
- `cooking-servings` buttons „Една порция по-малко“/„Една порция повече“ change „за N порции“ and the amounts (600 г × 2 → 1,2 кг); „по вкус“ has no number.
- `cooking-column` button „Прибери продуктите“ folds the column to the strip button „Продукти (N)“ (`aria-expanded=false`), which opens it again.
- `cooking-steps` „Напред“/„Назад“ (disabled on step 1), group „Към стъпка“ with buttons „Стъпка N“ (`aria-current=step`), horizontal swipe on region „Стъпки“.
- `cooking-exit` „Готово“ on the last step, „Затвори“ on any: back in history, or the recipe view without history.

## How to get to it (user POV)

- Recipe view → link „Готви“.
- Directly `/recipes/<id>/cook?servings=N` (N servings at entry instead of the recipe's).

## Driving it with drive.mjs

Preconditions:

- A recipe with ingredients and several steps; create it through `ctx.api('/api/recipes', …)` with header `X-Acting-User` when cooking, not creating, is under test (ingredient ids from `psql` on `ingredient`).
- `ctx.go('/?device=kiosk')` and `--device kiosk` (1280×800) for the landscape layout.

- **Enter.** `go('/recipes/<id>')`; `tap` link „Готви“ → text „Стъпка 1 от N“ and „за <servings> порции“.
- **Servings.** `tap` „Една порция повече“ twice → „за <servings+2> порции“, amounts in list „Продукти“ scaled.
- **Fold.** `tap` „Прибери продуктите“ → button `/Продукти \(\d+\)/`.
- **Jump.** `tap` „Стъпка N“ (last) → button „Готово“; `tap` it → heading level 1 = recipe title.

## Gotchas

- The dots animate (150 ms); wait ~500 ms before a `shot` right after a step change, or the old dot still looks current.
- On kiosk `IdleReturn` sends every screen except the dashboard back to `/` after 60 s without a touch (#232 changes this for Готвене); keep kiosk drives short.
- Seed has no `олио`; use `слънчогледово олио` or another seeded name.
