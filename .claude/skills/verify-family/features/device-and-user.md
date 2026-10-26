# Device and acting user

On first visit a device is told what it is (phone, kitchen tablet, TV); a phone then asks „Кой си?“ and acts as that person for every request. Both choices live on the device and can be changed in Настройки.

## Sub-features

- `device-choose` picks the mode on „Какво е това устройство?“.
- `device-query` sets the mode from `?device=phone|kiosk|tv` and removes the parameter from the address.
- `who-choose` picks the acting user on „Кой си?“ (phone only).
- `who-switch` changes the acting user from Настройки → „Кой си“ → „Смени“.
- `device-switch` changes the mode from Настройки → „Устройство“.

## How to get to it (user POV)

- Open any URL on a device with no mode: it redirects to `/device`.
- Open a link with `?device=…` (how the tablet and TV are set up).
- On phone with no acting user any screen redirects to `/who`.
- Bottom nav „Настройки“ → region „Кой си“ / region „Устройство“.

## Driving it with drive.mjs

Preconditions:

- A fresh run with no drives yet, or any run for `who-switch`/`device-switch`.

- **Choose device.** `go('/')`. The heading „Какво е това устройство?“ shows three buttons whose names start with `Телефон`, `Таблет в кухнята`, `Телевизор`. `tap(page.getByRole('button', { name: /^Телефон/ }))` → heading „Кой си?“.
- **Choose user.** `tap(page.getByRole('button', { name: 'Дани' }))` → navigation „Основна навигация“ and region „Днес накратко“ appear. Proven by `scenarios/setup-phone.mjs` (enters through `?device=phone`).
- **Switch user.** Bottom nav „Настройки“; region „Кой си“ shows text `Дани`; `tap(getByRole('link', { name: 'Смени' }))` → „Кой си?“; tap `Поли`; back in Настройки the region shows `Поли`. Second view: a shopping check made now is stored with `checked_by` = Поли's id (`psql` on `shopping_item`).
- **Switch device.** In Настройки, group „Устройство“: `tap(getByRole('radio', { name: /^Таблет в кухнята/ }))` → the radio is `[checked]`, region „Кой си“ disappears from Настройки and the bottom nav is gone; `go('/')` shows the kiosk layout (link „Настройки“ inside `main`). Return with `go('/?device=phone')`.

## Gotchas

- `?device=` is applied and then stripped, so `page.url()` never shows it; assert on the screen.
- Device mode and acting user are in the run's browser profile (localStorage `family.deviceMode`, `family.actingUserId`) and persist across drives. Switch back with `go('/?device=phone')` after a kiosk/TV drive.
- kiosk and TV never ask „Кой си?“ and send no acting user.
