---
name: verify-family
description: Launch and drive the family platform (React PWA in apps/web + Fastify api + Postgres) in a disposable, isolated stack and prove user-facing behavior in headless Chrome with screenshots, ARIA snapshots and database reads. Use to confirm a change works in the real app (phone, browser, kiosk or TV mode), to reproduce a UI bug, or to capture screenshots for a PR.
---

# Verify the family app

The surface is the web PWA (`apps/web`): phone, wide-screen browser (`browser`), kitchen tablet (`kiosk`) and TV modes of one React app, talking to the api over `/api` through the Vite proxy. The api has no UI of its own; reach it through the app, or through `ctx.api()` in a scenario for a second view. OpenClaw, Google Calendar and Wallet are external and are **off** in a verify run (see Gotchas).

Everything runs from `.claude/skills/verify-family/scripts/`. Paths below are relative to that directory.

## Launch

One-time setup in a checkout (or worktree):

```bash
PATH=$(ls -d ~/.nvm/versions/node/v24.* | sort -V | tail -1)/bin:$PATH   # pnpm needs Node >= 24.15; the system node may be 22
corepack pnpm install                     # at the repo root
(cd .claude/skills/verify-family/scripts && npm install)   # playwright-core 1.64.1; the browser is /usr/bin/google-chrome
```

Start a run:

```bash
./verify.sh up
```

It creates `/tmp/family-verify/<run>/` (override with `FAMILY_VERIFY_HOME`), starts a `postgres:17-alpine` container `family-verify-<run>` on tmpfs, the api with `tsx` (no watch) and Vite, each on a free loopback port, then waits until `/healthz` says `"db":"ok"` and the Vite proxy answers `/api/me`. Ready when it prints `verify: ready` and:

```
RUN_ID=20261026-144003-352625
WEB_URL=http://127.0.0.1:40237
API_URL=http://127.0.0.1:37393
EVIDENCE_DIR=/tmp/family-verify/20261026-144003-352625/evidence
```

For offline checks start with `WEB_MODE=preview ./verify.sh up`: the web is a production build served by `vite preview` (same `/api` proxy, ~20 s longer), so the PWA service worker exists, and drive with `--service-workers` (blocked by default). Go offline in the scenario with `context.setOffline(true)` after `await page.evaluate(() => navigator.serviceWorker.ready)` and a reload, so the worker controls the page.

The api runs with a clean environment: no repo `.env`, `AUTH_MODE=dev` as `verify@example.test`, migrations applied at start (seed users Дани and Поли, seed ingredients, nothing else), OpenClaw pointed at a dead port. Takes ~5 s. Teardown is `./verify.sh down` (see Cleanup).

Runs are isolated from each other and from `pnpm dev` (5173/18091/5432), the compose stack and the test database (5433), so parallel worktrees can each run one. With more than one run alive (several agents, or two branches), always pass the run id (`verify.sh doctor|psql|down <run>`, `drive.mjs --run <run>`): without it every command takes `latest`, which is whichever run started last, possibly another agent's. Two runs from the same checkout started in the same second were driven side by side without interference. Never drive a `WEB_URL` you did not get from `verify.sh up`/`env`; in particular never drive `localhost:5173` — it is the user's dev server and database.

## Doctor

Run first, and whenever anything looks off:

```bash
./verify.sh doctor [run]     # default: the latest run
```

Read-only. Checks the container is running, api and Vite processes are alive, each port is held by this run's process group (not someone else's), `/healthz` db ok, the proxy reaches the api as `verify@example.test`, and whether the `apps/api` or `packages/shared` trees (committed or not) changed since `up`; commits elsewhere don't count. Exit 1 on any `FAIL`. A `WARN` about changed code means the api still runs the old code (Vite hot-reloads the web, the api does not): `down` + `up` before proving api changes. `./verify.sh list` shows all runs and whether they are up.

## Drive

`drive.mjs` runs a scenario module against the run in headless Chrome:

```bash
node drive.mjs ../scenarios/setup-phone.mjs          # phone viewport 390×844, bg-BG, Europe/Sofia
node drive.mjs ../scenarios/recipe-create.mjs
node drive.mjs my-scenario.mjs --device kiosk        # 1280×800; browser = 1440×900; tv = 1920×1080; --headed to watch; --run <id>
```

Any Node ≥ 18 runs it. It prints `PASS <dir>` or `FAIL <dir>` + the error and exits 0/1. The browser profile lives in the run dir, so localStorage (device mode, acting user, theme) carries over between drives of a run, and the database carries over too: scenarios build on each other in order.

A scenario is `export default async (ctx) => {}`. Use these, not raw `page.goto`/`click`, so every action lands in `steps.log`:

| ctx | does |
|---|---|
| `go(path)` | navigate to `WEB_URL + path`, wait for network idle |
| `tap(locator, label)` | scroll the element to the viewport middle and click (plain `.click()` gets intercepted by the fixed bottom nav on phone) |
| `see(locator, label)` | wait ≤ 10 s until visible, else throw |
| `step(text)` | note a user action |
| `aria(name)` / `shot(name)` | ARIA snapshot of `<body>` / full-page PNG into the evidence dir |
| `psql(sql)` | query the run's database, returns psql output, logs to `db.log` |
| `api(path, init)` | `fetch(WEB_URL + path)` through the proxy; add header `X-Acting-User: <user id>` for routes that need it |
| `page`, `context`, `env`, `device`, `out` | raw Playwright and run info |

Shipped scenarios, in dependency order (all proven):

- `scenarios/setup-phone.mjs`: `/?device=phone` → „Кой си?“ → Дани → dashboard. Run first in every new run.
- `scenarios/recipe-create.mjs`: new dinner recipe with `лук 2 бр.`, checked in the view, the list and the `recipe` tables.
- `scenarios/menu-to-shopping.mjs`: next week's empty plan, Monday = that recipe, then the computed list (scaled to `1 бр.`), a check, a manual item, reload and DB read.

Handles: use roles and accessible names (all UI text is Bulgarian), e.g. `page.getByRole('navigation', { name: 'Основна навигация' }).getByRole('link', { name: 'Меню' })`. The app has no `data-testid`s. Per-feature handles, entry points and end states are in [features/README.md](features/README.md); read the matching file before writing a scenario. To discover handles on a screen, drive it once with `aria('look')` and read the `.aria.yml`.

Ad-hoc scenarios belong outside the repo (e.g. your scratchpad); add one to `scenarios/` only once it passes on a fresh run.

## Evidence

Each drive writes `/tmp/family-verify/<run>/evidence/<UTC timestamp>-<scenario>/`:

- `run.txt` (run id, scenario, device, git sha, api code fingerprint), `steps.log` (every go/tap/see/step/shot, then `PASS` or `FAIL` + stack)
- `NN-<name>.png`, `NN-<name>.aria.yml` in action order; `failure.png` + `failure.aria.yml` on failure
- `console.log` (browser console and page errors), `network.log` (every `/api/*` response with status), `db.log` (SQL + result)

Proof standards:

- Drive the real user path: device and user chosen through the UI or `?device=`, navigation through „Основна навигация“ or links, data entered through forms. Don't seed through `ctx.api()` or SQL what the feature under test is supposed to create; use them only to set up *other* state or as a second view.
- Capture the action and the result: an `aria`/`shot` before and after the change, not only the final screen.
- Check side effects with a second view: a reload, another screen showing the same data, and `psql` on the table that should have changed (`recipe`, `recipe_ingredient`, `meal_plan`, `meal`, `shopping_list`, `shopping_item`, `recipe_suggestion_request`, `menu_proposal_request`, …).
- Read `console.log` and `network.log`: a passing scenario with a `[pageerror]` or an unexpected 5xx is not clean. `404` on `GET /api/menu/plans?weekStart=…` or `/api/shopping-lists/<week>` (no plan that week) and on `GET /api/notifications/vapid-key` (push off) is normal, and so is `503` on an AI request (OpenClaw off).
- External systems are off, not mocked: the app must show its own „не е конфигуриран“ / „AI не е наличен в момента“ states. Proving an AI or sync happy path needs the real system and is the human's manual step (README → Smoke тест), not this skill.
- For a PR, attach the PNGs from the evidence dir; they show phone width unless you drove with `--device`.

## Cleanup

```bash
./verify.sh down [run]
```

Sends SIGTERM to the api and Vite process groups this run started (by recorded pid, never by name), removes only the `family-verify-<run>` container (its tmpfs data goes with it) and the browser profile, and marks the run down. Logs (`logs/`) and `evidence/` stay in `/tmp/family-verify/<run>/`; delete old run dirs by hand when no longer needed. Run `down` after every attempt, including failed `up`s and failed drives, so ports and containers don't pile up; `./verify.sh list` and `docker ps --filter label=family-verify` show leftovers.

## Gotchas

- **Node:** `node` on PATH may be 22; `verify.sh` finds nvm's newest 24.x itself, but `pnpm install` needs it on PATH (Launch). In this environment `cd` into the repo may reset the Node version; use the absolute nvm path.
- **The api does not reload.** Code changes in `apps/api` or `packages/shared` need `down` + `up`; doctor warns.
- **Device mode is sticky per run.** `?device=browser|kiosk|tv` overwrites the stored mode for all later drives in the run; go back with `go('/?device=phone')` (the acting user stays). kiosk and TV have no navigation and no acting user; browser has both, with the navigation on top.
- **State accumulates per run.** A plan for a week can be created once (`Започни празно` disappears after); `menu-to-shopping.mjs` uses next week and needs a fresh run to repeat. Unique titles (`Date.now()`) keep recipe scenarios rerunnable.
- **Selection lists filter by slot:** the meal sheet lists only recipes tagged `вечеря` („Вечерни рецепти“).
- **Seed data:** users Дани (`11111111-1111-4111-8111-111111111111`) and Поли (`22222222-2222-4222-8222-222222222222`); ~100 ingredients (`лук`, `картоф`, `чесън`, …); no recipes, plans or lists.
