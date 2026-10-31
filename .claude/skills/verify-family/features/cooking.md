# Cooking

Готвене for one recipe, laid out for a wide screen (kiosk and browser in landscape): column „Продукти“ on the left with servings −/+ and the scaled amounts, one step on the right with „Стъпка X от N“, „Назад“/„Напред“, a dot per step and swipe. „Готово“ on the last step and „Затвори“ on any step go back to the previous screen. Nothing reaches the api; the step and the checks are kept in localStorage per recipe until midnight (Sofia), the folded column per device.

## Sub-features

- `cooking-entry` link „Готви“ on the recipe view (kiosk, phone, browser; not TV) opens `/recipes/<id>/cook`.
- `cooking-servings` buttons „Една порция по-малко“/„Една порция повече“ change „за N порции“ and the amounts (600 г × 2 → 1,2 кг); „по вкус“ has no number.
- `cooking-column` button „Прибери продуктите“ folds the column to the strip button „Продукти (N)“ (`aria-expanded=false`), which opens it again.
- `cooking-sheet` narrow screen (phone portrait, below 48rem): no column; button „Продукти (N)“ above the step opens dialog „Продукти“ (the Sheet) with the same −/+ and list „Продукти“; „Готово“ in the dialog closes it, servings stay.
- `cooking-checks` each product line is a checkbox named „<name> <amount>“ (e.g. „лук 2 бр.“); checking moves it into the folded group button „Използвани (N)“ at the bottom, which opens list „Използвани“; unchecking puts it back in place. „Продукти (N)“ counts the unchecked lines.
- `cooking-memory` leaving („Затвори“, kiosk idle return) and entering again the same day restores the step and the checks; „Готово“ on the last step forgets them, so the next entry starts at step 1 (`localStorage['family.cooking.progress']`); a folded column stays folded (`family.cooking.ingredientsOpen`).
- `cooking-steps` small arrow buttons in the step header around „Стъпка X от N“: „Назад“ (‹, disabled on step 1) and „Напред“ (›), on the last step „Готово“ (✓); group „Към стъпка“ with buttons „Стъпка N“ (`aria-current=step`, hidden below 32rem height), horizontal swipe on region „Стъпки“.
- `cooking-text-size` buttons „По-дребен текст“/„По-едър текст“ (A−/A+) in the step header scale the step text in 7 steps (0.6–1.3, inline `--cooking-text-scale` on the text), disabled at the ends; remembered on the device (`family.cooking.textSize`).
- `cooking-scroll` Готвене is never taller than the screen (check phone landscape too, e.g. 915×412 via `page.setViewportSize`: the text must keep most of the height): a long step scrolls inside `.cooking-steps__text` (the document does not scroll) and a new step starts scrolled to the top.
- `cooking-timers` a time in the step text („15 мин“, „10–15 мин“, „1 ч и 30 мин“) is a button named „Таймер <time>“ (shown „⏱<time>“); tapping it adds a row to region „Таймери“ (list above the step text, on every step) with „Стъпка N · <time>“ and the remaining „m:ss“, „Изтече“ when expired; a timer from another recipe carries that recipe's title in front. Timers live in app memory only (#255): a reload (`ctx.go`) empties the strip, so switch recipes with `history.pushState` + `popstate`.
- `cooking-manual-timer` button „Таймер“ (exact name; shown „⏱ Таймер“) under the step text opens dialog „Таймер“: the chosen time („0 мин“, „7 мин“, „1 ч 15 мин“), „+1 мин“, „+5 мин“, „+10 мин“, „Нулирай“ and „Пусни“ (disabled at 0). „Пусни“ closes the dialog and adds „Таймер · Стъпка N“ to region „Таймери“.
- `cooking-exit` „Готово“ on the last step, „Затвори“ on any: back in history, or the recipe view without history.

## How to get to it (user POV)

- Recipe view → link „Готви“.
- Directly `/recipes/<id>/cook?servings=N` (N servings at entry instead of the recipe's).

## Driving it with drive.mjs

Preconditions:

- A recipe with ingredients and several steps; create it through `ctx.api('/api/recipes', …)` with header `X-Acting-User` when cooking, not creating, is under test (ingredient ids from `psql` on `ingredient`).
- `ctx.go('/?device=kiosk')` and `--device kiosk` (1280×800) for the landscape layout; the default phone viewport (390×844) gives the sheet layout.

- **Enter.** `go('/recipes/<id>')`; `tap` link „Готви“ → text „Стъпка 1 от N“ and „за <servings> порции“.
- **Servings.** `tap` „Една порция повече“ twice → „за <servings+2> порции“, amounts in list „Продукти“ scaled.
- **Fold.** `tap` „Прибери продуктите“ → button `/Продукти \(\d+\)/`.
- **Sheet (phone).** `tap` button `/^Продукти \(\d+\)$/` → dialog „Продукти“; scope −/+ and the list to the dialog; `tap` its „Готово“ → no dialog. On the last step „Готово“ is unique only while the sheet is closed.
- **Check.** `tap` checkbox `/^лук/` → button „Използвани (1)“; `tap` it → list „Използвани“.
- **Jump.** `tap` „Стъпка N“ (last) → button „Готово“; `tap` it → heading level 1 = recipe title.

## Gotchas

- The browser profile keeps localStorage between drives of a run: a column folded in an earlier drive is still folded, and a recipe re-entered the same day resumes its step. Remove `family.cooking.ingredientsOpen` / `family.cooking.progress` at the start of a scenario that expects a fresh start.

- The dots animate (150 ms); wait ~500 ms before a `shot` right after a step change, or the old dot still looks current.
- On kiosk `IdleReturn` sends Готвене back to `/` after 2 hours without a touch (other screens after 60 s), so the recipe view before „Готви“ still times out after 60 s.
- Phone and browser hold a `screen` wake lock only while Готвене is open; headless Chrome may refuse it, which only logs a warning.
- Seed has no `олио`; use `слънчогледово олио` or another seeded name.
