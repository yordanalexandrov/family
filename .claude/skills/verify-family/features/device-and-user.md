# Device and acting user

On first visit a device is told what it is (phone, browser, kitchen tablet, TV). A personal device (phone or browser) then asks „Кой си?“ and acts as that person for every request. Both choices live on the device and can be changed in Настройки.

## Sub-features

- `device-choose` picks the mode on „Какво е това устройство?“ (Телефон, Браузър, Таблет в кухнята, Телевизор).
- `device-query` sets the mode from `?device=phone|browser|kiosk|tv` and removes the parameter from the address.
- `who-choose` picks the acting user on „Кой си?“ (phone and browser).
- `who-switch` changes the acting user from Настройки → „Кой си“ → „Смени“.
- `device-switch` changes the mode from Настройки → „Устройство“.
- `browser-mode` the phone app laid out for a wide screen: navigation „Основна навигация“ at the top instead of the bottom.

## How to get to it (user POV)

- Open any URL on a device with no mode: it redirects to `/device`.
- Open a link with `?device=…` (how the tablet and TV are set up).
- On a personal device with no acting user any screen redirects to `/who`.
- Navigation „Основна навигация“ → „Настройки“ → region „Кой си“ / region „Устройство“.

## Driving it with drive.mjs

Preconditions:

- `device-choose`: a profile with no device mode. In an existing run, `go('/')` then `page.evaluate(() => localStorage.clear())` and `go('/')` again.
- `who-switch`/`device-switch`: any run after `setup-phone.mjs`.

- **Choose device.** `go('/')`. Heading „Какво е това устройство?“ shows four buttons whose names start with `Телефон`, `Браузър`, `Таблет в кухнята`, `Телевизор`. `tap(page.getByRole('button', { name: /^Телефон/ }))` → heading „Кой си?“.
- **Choose user.** `tap(page.getByRole('button', { name: 'Дани' }))` → navigation „Основна навигация“ and region „Днес накратко“ appear. Also proven by `scenarios/setup-phone.mjs` (enters through `?device=phone`).
- **Switch user.** Nav „Настройки“; region „Кой си“ shows text `Дани` and region „Известия“ is present; `tap(getByRole('region', { name: 'Кой си' }).getByRole('link', { name: 'Смени' }))` → „Кой си?“; tap `Поли`; back in Настройки the region shows `Поли`. Second view: a shopping check made now is stored with `checked_by` = Поли's id (`psql` on `shopping_item`).
- **Switch device.** In Настройки, region „Устройство“: `tap(getByRole('radio', { name: /^Таблет в кухнята/ }))` → the radio is checked, regions „Кой си“ and „Известия“ disappear and the navigation is gone; `go('/')` shows the kiosk layout (link „Настройки“ inside `main`). Return with `go('/?device=phone')`.
- **Browser mode.** Drive with `--device browser` (1440×900); `go('/?device=browser')` → navigation „Основна навигация“ sits above `main` (compare `boundingBox().y`) with links Дашборд, Календар, Рецепти, Меню, Пазаруване, Килер, Настройки; Настройки still has region „Кой си“. Return with `go('/?device=phone')`.

## Gotchas

- `?device=` is applied and then stripped, so `page.url()` never shows it; assert on the screen.
- Device mode and acting user are in the run's browser profile (localStorage `family.deviceMode`, `family.actingUserId`) and persist across drives. Switch back with `go('/?device=phone')` after a browser, kiosk or TV drive.
- kiosk and TV never ask „Кой си?“ and send no acting user; browser does, like phone.
- The device radios' accessible names include their description (`Телефон Дашборд, календар и настройки за един човек.`); match them with `^`-anchored regexes.
