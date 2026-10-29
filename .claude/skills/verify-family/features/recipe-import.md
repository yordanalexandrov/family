# Recipe import

„Внеси рецепта“ turns a pasted text, a link or a photo into a recipe draft through OpenClaw. The phone's share sheet opens the same screen with the shared text or photo. In a run OpenClaw is off, so only the forms and the unavailable state can be verified.

## Sub-features

- `import-text` tab „Текст“: textbox „Текст на рецептата“ (+ optional „Линк към източника (по желание)“), button „Внеси“.
- `import-link` tab „Линк“: textbox „Линк към рецептата“, button „Внеси“.
- `import-photo` tab „Снимка“: „Снимай“ / „Избери от галерията“.
- `import-share` PWA share target: `/recipes/import?title=…&text=…&url=…` submits by itself on the „Текст“ tab.
- `import-recent` region „Последни внасяния“.
- `import-unavailable` every submit shows alert „AI не е на разположение в момента“ in a run (`503` on `POST /api/recipe-imports`).

## How to get to it (user POV)

- Recipes list → link „Внеси“ → `/recipes/import`.
- Share a text, link or photo to the installed app.

## Driving it with drive.mjs

Preconditions:

- `setup-phone.mjs` ran.

- **Open.** `go('/recipes')`; `tap` link „Внеси“ → heading „Внеси рецепта“, tab „Текст“ `selected`, region „Последни внасяния“.
- **Text.** Fill textbox „Текст на рецептата“; `tap` „Внеси“ → alert „AI не е на разположение в момента“.
- **Link.** `tap` tab „Линк“; fill textbox „Линк към рецептата“ `https://example.com/r`; `tap` „Внеси“ → the same alert.
- **Photo.** `tap` tab „Снимка“ → the two pickers; choosing a file is not covered.
- **Share.** `go('/recipes/import?title=X&text=Y')` → tab „Текст“ selected and the alert, without a tap.
- Results (`/recipes/import/<requestId>`) need a real OpenClaw: not verifiable in a run.

## Gotchas

- On „Снимка“ the button „Внеси“ stays disabled until a photo is chosen.
- Every submit adds a `503` on `POST /api/recipe-imports` to `network.log`; that is the expected unavailable state.
