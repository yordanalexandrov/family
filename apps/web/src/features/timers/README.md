# timers — таймерите в Готвене

## Overview
Таймерите на устройството в Готвене: store без React (`timer-store.ts`) със запис в localStorage, обвит в `TimersProvider`, лента, меню, ръчен таймер, банери за изтекли и звук през Web Audio. Тук е и разпознаването на времена в текста на стъпка и блокерът при излизане от Готвене с активен таймер.

## Interface
- `timer-store.ts:createTimerStore`, `Timer`, `NewTimer`, `TimerStore`, `TIMERS_KEY`, `MINUTE_MS` — store и типове
- `timer-store.ts:remainingMs`, `isExpired`, `isPaused`, `isActiveTimer`, `formatRemaining`, `formatExpired`, `timerTime`, `timerLabel` — състояние и надписи
- `timer-store.ts:msToNextChange`, `TimerSource` — след колко ms се сменя надписът (секунда докато брои, минута след изтичане); произходът на таймера
- `use-timers.tsx:TimersProvider`, `useTimers`, `useAlarmSound` — един store и един звук за приложението
- `alarm-sound.ts:createAlarmSound` — синтезиран сигнал (`unlock`/`play`/`stop`)
- `step-times.ts:findStepTimes`, `StepTime` — времена в текста на стъпка
- `StepText.tsx:StepText`, `ManualTimer.tsx:ManualTimer`, `TimerStrip.tsx:TimerStrip`, `TimerMenu.tsx:TimerMenu`, `TimerAlarms.tsx:TimerAlarms` — UI
- `use-leave-cooking.tsx:useLeaveCooking` — `{ leave, confirmation }` при излизане

## Invariants
- `timer-store.ts:Timer.endsAt` — пази се крайният момент, не оставащото; на пауза оставащото е `endsAt - pausedAt`
- `timer-store.ts:isStale` — изтекъл таймер от предишен ден (по София) се маха; `scheduleMidnight` чисти в полунощ
- `timer-store.ts:silence` — заглушава само изтеклите незаглушени; връща `false`, ако няма такива
- `timer-store.ts:createTimerStore` — `list()` връща същия масив, докато нищо не се промени
- `step-times.ts:MAX_SECONDS` — времена над 12 часа не се предлагат; „ч.л.“ не е време
- `use-timers.tsx:createTimers` — `start`, `addMinute` и `restart` винаги първо отключват звука
- `TimerAlarms.tsx:ALARM_SOUND_MS` — звукът трае най-много 2 минути; вибрира веднъж за всяко изтичане
- `use-leave-cooking.tsx:useLeaveCooking` — блокира само при активен таймер и цел извън `/recipes/$id/cook`; „Излез“ не отменя таймерите

## Side Effects
- `timer-store.ts:writeTimers`, `readTimers` — localStorage `family.timers`
- `timer-store.ts:createTimerStore` — `subscribe` пуска слушател `storage` и `setTimeout` до полунощ (`scheduleMidnight`) само докато има абонат; махат се при последния
- `TimerStrip.tsx:useTick`, `TimerAlarms.tsx:TimerAlarms` — `setTimeout` за пречертаване в следващия момент на промяна (`msToNextChange`, изтичане, край на звука)
- `alarm-sound.ts:createAlarmSound` — `AudioContext` (осцилатор 880 Hz) и `setInterval` 1000 ms
- `TimerAlarms.tsx:TimerAlarms` — `navigator.vibrate`, `pointerdown`/`keydown` на `document` за отключване на звука
- `use-leave-cooking.tsx:useLeaveCooking` — `useBlocker` от TanStack Router
- `use-leave-cooking.tsx:LeaveConfirmation` — `keydown` (Escape = „Остани“) на `document`; фокусът отива на „Остани“

## Verification
- Run: `pnpm --filter web test src/features/timers`
