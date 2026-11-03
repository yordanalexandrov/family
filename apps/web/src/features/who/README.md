# who — „Кой си?“

## Overview
Екранът „Кой си?“ за избор на действащ потребител и след това „Искаш ли напомняния?“ за Web Push на лично устройство. Ползва `app/acting-user.ts` и логиката за push от `features/settings`.

## Interface
- `WhoScreen.tsx:WhoScreen` — екранът `/who`
- `RemindersStep.tsx:RemindersStep` — стъпката за напомняния (`onDone`)

## Invariants
- `WhoScreen.tsx:choose` — стъпката за напомняния се показва само на лично устройство и ако не е отказана с „По-късно“; иначе води към `/`
- `RemindersStep.tsx:skip` — прескача се при грешка или когато статусът не е `off`/`unready`; „Включи“ само при `off`
- `RemindersStep.tsx:RemindersStep` — „По-късно“ вика `dismissPushPrompt()`; в режим `browser` текстът е „в този браузър“, иначе „на този телефон“
- `RemindersStep.tsx:InstallHint` — подсказка „Инсталирай“ за Android само извън режим `browser`; скрита при `standalone`, след приемане казва „Приложението е инсталирано“

## Side Effects
- `WhoScreen.tsx:choose` — `setActingUserId(id)` (localStorage през `app/acting-user.ts`) и `navigate({ to: '/' })`
- `RemindersStep.tsx:RemindersStep` — `usePushDevice`, `EnablePushButton`, `dismissPushPrompt` от `features/settings`; `useInstallPrompt().install()`

## Verification
- Run: `pnpm --filter web test src/features/who`
