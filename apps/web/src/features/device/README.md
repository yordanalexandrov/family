# device — избор на режим на устройството

## Overview
Екранът „Какво е това устройство?“ за избор на режима на устройството (телефон, браузър, kiosk, TV). Записва избора през `app/device-mode.ts` и води към началото; работи и със стрелките на дистанционно.

## Interface
- `DeviceScreen.tsx:DeviceScreen` — екранът `/device`
- `DeviceScreen.tsx:DEVICE_CHOICES` — четирите режима с име и описание

## Invariants
- `DeviceScreen.tsx:onKeyDown` — стрелките местят фокуса циклично между бутоните; първият бутон има `autoFocus`
- `DeviceScreen.tsx:choose` — след `setMode` винаги навигира към `/`

## Side Effects
- `DeviceScreen.tsx:choose` — `setMode(mode)` (localStorage през `app/device-mode.ts`) и `navigate({ to: '/' })`

## Verification
- Run: `pnpm --filter web test src/features/device`
