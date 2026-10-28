# Settings

„Настройки“ holds the per-device choices: theme, visual effects, device mode, the acting user and Web Push reminders. Device and user are covered in device-and-user.md; this file covers the rest.

## Sub-features

- `settings-theme` region „Тема“: radios „Светла“, „Тъмна“, „Автоматично по часа“; sets `data-theme` on `<html>`.
- `settings-effects` region „Ефекти“: radios „Пълни“, „Леки“, „Автоматично“.
- `settings-notifications` region „Известия“ (phone and browser only): in a run it says „Известията не са включени на сървъра.“ and shows no switches.

## How to get to it (user POV)

- Nav link „Настройки“ → `/settings`; on kiosk, link „Настройки“ on the dashboard.

## Driving it with drive.mjs

Preconditions:

- `setup-phone.mjs` ran.

- **Open.** `tap` nav link „Настройки“ → regions „Тема“, „Ефекти“, „Устройство“, „Кой си“, „Известия“.
- **Theme.** `tap(getByRole('region', { name: 'Тема' }).getByRole('radio', { name: 'Тъмна' }))` → `document.documentElement.dataset.theme === 'dark'`; `shot('dark')`. Put it back with „Автоматично по часа“.
- **Effects.** `tap` radio „Леки“ in region „Ефекти“ → checked; back with „Автоматично“.
- **Notifications.** `see(getByRole('region', { name: 'Известия' }).getByText(/Известията не са включени на сървъра/))`. Turning reminders on needs VAPID keys and a real push service: not verifiable in a run.

## Gotchas

- Theme and effects are stored in the run's browser profile and carry over to later drives; reset them at the end of a scenario.
- `GET /api/notifications/vapid-key` answers 404 in a run (push disabled); that is expected.
