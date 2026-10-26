# Dashboard

The home screen: date, clock and day ring, today's cooking from the menu, today's events, the monthly budget and the next days. Phone, kiosk and TV show different layouts of the same data; each source says when it is not configured or stale.

## Sub-features

- `dash-phone` phone layout with regions „Днес накратко“, „Днес“, „Бюджет“, „Следващите дни“ and the bottom nav.
- `dash-kiosk` tablet layout: links „Календар“, „Следващите дни“, „Настройки“ and the cooking card inside `main`, no bottom nav.
- `dash-tv` TV layout: same regions, no links, cooking card as text.
- `dash-cooking` the „Днес се готви“ card reflects today's dinner from the menu.
- `dash-unconfigured` list „Синхронизация“ shows `Календар: не е конфигуриран`, `Бюджет: не е конфигуриран`.

## How to get to it (user POV)

- `/` on any device; bottom nav „Дашборд“ on phone.
- kiosk returns to `/` by itself after idling on another screen.

## Driving it with drive.mjs

Preconditions:

- `setup-phone.mjs` ran. For `dash-cooking` with a dinner: a plan for **this** week with today's dinner set (menu.md → `menu-meal` on this week's tab).

- **Phone.** `go('/')`; `see(getByRole('region', { name: 'Днес накратко' }))`; `aria('dash-phone')`. Paragraphs „Google Calendar не е конфигуриран“ and „Wallet не е конфигуриран“ are expected in a run.
- **Cooking card.** Without a plan the link reads `Днес се готви Няма меню за днес` (`/url: /menu`). With today's dinner it reads `Днес се готви готви <cook> <recipe>`; `tap` it → `/menu`.
- **Kiosk.** `go('/?device=kiosk')` with `--device kiosk`; `see(getByRole('link', { name: 'Настройки' }))` inside `main`, no navigation „Основна навигация“; `shot('kiosk')`.
- **TV.** `go('/?device=tv')` with `--device tv`; no links in `main`; the cooking card is plain text; `shot('tv')`.
- **Back to phone.** `go('/?device=phone')`.

## Gotchas

- The clock and „Пръстен на деня“ change every minute; don't compare screenshots pixel by pixel.
- Calendar and budget content cannot be verified in a run (no Google/Wallet); only their unconfigured states.
- The dashboard caches its last response in localStorage; after changing the menu, `go('/')` again rather than trusting a screen that was already open.
