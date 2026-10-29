# Dashboard

The home screen: date, clock and day ring, today's cooking from the menu, today's events, the monthly budget and the next days. Phone/browser, kiosk and TV show different layouts of the same data; each source says when it is not configured or stale.

## Sub-features

- `dash-phone` phone layout with regions „Днес накратко“, „Днес“, „Бюджет“, „Следващите дни“ and navigation „Основна навигация“ at the bottom. Browser mode uses the same regions in two columns, with the navigation on top.
- `dash-kiosk` tablet layout: links „Календар“, „Настройки“, the „Днес се готви“ card and the whole „Следващите дни“ card inside `main`; no region „Днес“, no navigation. Returns to `/` after 60 s idle on another screen.
- `dash-tv` TV layout: regions „Днес накратко“, „Бюджет“, „Следващите дни“, no region „Днес“, no links; the cooking card is plain text.
- `dash-cooking` the „Днес се готви“ card reflects today's dinner from the menu.
- `dash-unconfigured` the „Синхронизация“ list has img „Календар: не е конфигуриран“ and img „Бюджет: не е конфигуриран“; the cards say „Google Calendar не е конфигуриран“ / „Wallet не е конфигуриран“.

## How to get to it (user POV)

- `/` on any device; nav link „Дашборд“ on phone and browser.
- kiosk returns to `/` by itself after idling on another screen.

## Driving it with drive.mjs

Preconditions:

- `setup-phone.mjs` ran. For `dash-cooking` with a dinner: a plan for **this** week with today's dinner set (menu.md → `menu-meal` on this week's tab).

- **Phone.** `go('/')`; `see` regions „Днес накратко“, „Днес“ (`exact: true`), „Бюджет“, „Следващите дни“; `aria('dash-phone')`. Paragraphs „Google Calendar не е конфигуриран“ and „Wallet не е конфигуриран“ are expected in a run.
- **Cooking card.** Without a plan the link reads `Днес се готви Няма меню за днес` (`/url: /menu`). With today's dinner it reads `Днес се готви <recipe>` (plus servings when they differ from one each) and links to `/recipes/<id>` on phone/browser; a note-only dinner links to `/menu`. It is followed by a paragraph `готви <cook>`, `готвиш ти` or `няма готвач` with button `Аз` (phone only). A dinner (today's; tomorrow's from 20:00) whose recipe has pantry products „Във фризера“ adds region `Извади месото` below the core with button `Извадих`, then `✓ извадено`.
- **Browser.** `--device browser`; `go('/?device=browser')`; same regions, navigation above `main`; `shot('browser')`.
- **Kiosk.** `--device kiosk`; `go('/?device=kiosk')`; `see(getByRole('main').getByRole('link', { name: 'Настройки' }))` and link „Календар“; no navigation „Основна навигация“, no region „Днес“. `tap` link `/Днес се готви/` → `/menu` (always, even with a recipe); `go('/')`, `tap` link `/Следващите дни/` → `/calendar`.
- **TV.** `--device tv`; `go('/?device=tv')`; `getByRole('main').getByRole('link')` has count 0; the cooking card is plain text, `see(getByText(/Днес се готви/))`; `shot('tv')`.
- **Back to phone.** `go('/?device=phone')`.

## Gotchas

- The clock and „Пръстен на деня“ change every minute; don't compare screenshots pixel by pixel.
- Calendar and budget content cannot be verified in a run (no Google/Wallet); only their unconfigured states.
- „Google Calendar не е конфигуриран“ appears several times on one screen (core, „Днес“, „Следващите дни“); scope `getByText` to a region or use `.first()`.
- Region „Днес“ needs `exact: true`, or it also matches „Днес накратко“.
- The kiosk „Следващите дни“ link has no label of its own; its name is the whole card text, so match it with a regex.
- The dashboard caches its last response in localStorage; after changing the menu, `go('/')` again rather than trusting a screen that was already open.
