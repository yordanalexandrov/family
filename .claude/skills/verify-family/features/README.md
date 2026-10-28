# Family app verification map

This directory is the maintained source for verifying the user-facing behavior of the family app. Read the index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- A run started with `scripts/verify.sh up`; `scripts/verify.sh doctor` prints no `FAIL`.
- `scripts/drive.mjs` drives `WEB_URL` of that run only, never `localhost:5173`.
- Fresh database: seed users Дани and Поли, seed ingredients, no recipes, plans or lists.
- `scenarios/setup-phone.mjs` has run in the same run, so the device is `phone` and the acting user is Дани. Features that need other state say so under Preconditions.
- Google Calendar, Wallet and OpenClaw are not configured in a run.

## Driving conventions

- All UI text is Bulgarian; locate by role and accessible name exactly as written here (`getByRole('button', { name: 'Започни празно' })`).
- Click with `ctx.tap`, not `locator.click()`: on phone the fixed bottom nav intercepts clicks near the bottom edge.
- Navigate between main screens through `getByRole('navigation', { name: 'Основна навигация' })` links on phone (bottom) and browser (top); kiosk reaches screens through dashboard links; TV has no navigation.
- Switch device with `ctx.go('/?device=phone|browser|kiosk|tv')` and drive with the matching `--device` viewport. The mode sticks for the rest of the run.
- Use unique titles (`… ${Date.now().toString(36)}`) for anything you create, so a scenario can rerun in the same run.

## Proof and skip reporting

- Capture the user action and the resulting state: `aria`/`shot` before and after.
- Mutation proof includes a second view: reload or another screen, plus `ctx.psql` on the changed table.
- Read the drive's `console.log` and `network.log`; report `[pageerror]` and unexpected 4xx/5xx even when the scenario passed.
- Record the feature file, sub-feature ID and entry point with every claim; artifacts are in `/tmp/family-verify/<run>/evidence/`.
- A sub-feature that needs an external system (AI proposals, suggestions and imports, calendar or budget sync, Web Push) is reported as not verifiable in a run, with the state the app showed instead. Do not report it as verified.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with drive.mjs` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact ctx call and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

## Features

- [Device and acting user](./device-and-user.md) covers the first-visit device choice, „Кой си?“, switching user and device in Настройки, and browser mode.
- [Dashboard](./dashboard.md) covers the phone/browser, kiosk and TV dashboards and their unconfigured states.
- [Recipes](./recipes.md) covers creating, viewing, searching, rating, editing and archiving recipes, new ingredients and the suggestion request screen.
- [Recipe import](./recipe-import.md) covers the text, link, photo and share-target import forms and their unavailable state.
- [Weekly menu](./menu.md) covers an empty plan, choosing a dinner, cook and servings, the thread, notes, the filter, deleting a plan and the AI actions when unavailable.
- [Shopping list](./shopping.md) covers the list computed from the menu, checking, hiding, pantry staples, manual items, its source dishes and the offline queue.
- [Pantry](./pantry.md) covers the „Килер“ screen: adding staples and temporary items, changing kind, removing.
- [Settings](./settings.md) covers theme, effects and the notifications section.

Not mapped yet: Календар (`/calendar`, needs Google Calendar for content); suggestion review and import results (need a real OpenClaw); the „Как беше?“ rating under past meals and moving a meal („Премести на…“, drag) in the menu.
