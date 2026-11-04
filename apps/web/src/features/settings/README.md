# settings — „Настройки“ и известия

## Overview
Екранът „Настройки“: на лично устройство „Кой си“, „Известия“ (Web Push) и „Уреди“, а на всички режими тема, ниво на ефектите и режим на устройството с потвърждение за kiosk/TV. `push.ts` държи логиката за Web Push: абонамента на устройството, видовете известия на човека и преместването на абонамента при смяна на действащия потребител.

## Interface
- `SettingsScreen.tsx:SettingsScreen` — екранът `/settings`
- `AppliancesSection.tsx:AppliancesSection`, `NotificationsSection.tsx:NotificationsSection`, `EnablePushButton.tsx:EnablePushButton` — секциите и бутонът „Включи известия“
- `DeviceModeConfirm.tsx:DeviceModeConfirm`, `DeviceModeConfirm.tsx:needsConfirmation` — потвърждение при смяна към kiosk/TV
- `push.ts:usePushDevice`, `useEnablePush`, `useDisablePush`, `PushDevice`, `pushSupported` — състоянието и абонаментът на устройството
- `push.ts:useNotificationSettings`, `useSaveNotificationSettings`, `useSendTestNotification` — видове известия и пробно известие
- `push.ts:usePushFollowsActingUser` — монтира се веднъж в `App`
- `push.ts:readPushPromptDismissed`, `push.ts:dismissPushPrompt`, `push.ts:pushKeys`, `push.ts:SERVICE_WORKER_TIMEOUT_MS` — „По-късно“, ключове, таймаут

## Invariants
- `push.ts:readPushDevice` — ред: `unsupported` → `disabled` (отказ `push_disabled`) → `denied` → `unready` (няма service worker за 10 s) → `on`/`off`
- `push.ts:useEnablePush` — отказ на разрешението връща `false`, не е грешка; неуспешен PUT маха абонамента и от браузъра
- `push.ts:usePushFollowsActingUser` — праща абонамента пак само при реална смяна към не-`null` потребител, на лично устройство и при поддръжка на Web Push
- `push.ts:useSaveNotificationSettings` — оптимистично, с връщане при грешка
- `push.ts:useNotificationSettings` — само при `actingUserId !== null`
- `DeviceModeConfirm.tsx:needsConfirmation` — потвърждение само при смяна към нелично устройство (kiosk, TV)
- `SettingsScreen.tsx:SettingsScreen` — „Кой си“, „Известия“ и „Уреди“ само при `isPersonalDevice(mode)`; долу показва `Версия {__APP_VERSION__}`; държи котвата `#appliances` (от „Поискай предложения“) горе с `useKeepHashTargetInView`
- `NotificationsSection.tsx:Device` — при `unready` има „Опитай пак“; при `denied` и `off` видовете известия са приглушени (`muted`); „Изпрати пробно“ и „Изключи на това устройство“ само при `on`
- `AppliancesSection.tsx:add` — празно име не се праща; `maxLength` е `APPLIANCE_NAME_MAX`
- `AppliancesSection.tsx:remove` — toast „Махнах …“ с „Върни“, което добавя уреда наново със същото `enabled`

## Side Effects
- `push.ts:readPushDevice` — GET `/api/notifications/vapid-key`; `Notification.permission`, `navigator.serviceWorker.ready`, `pushManager.getSubscription()`
- `push.ts:useEnablePush` — `Notification.requestPermission()`, `pushManager.subscribe(...)`, PUT `/api/notifications/subscription`
- `push.ts:useDisablePush` — `subscription.unsubscribe()` и DELETE `/api/notifications/subscription`
- `push.ts:useNotificationSettings`, `useSaveNotificationSettings`, `useSendTestNotification` — GET/PUT `/api/notifications/settings`, POST `/api/notifications/test`
- `push.ts:pushPromptDismissed` — localStorage `family.pushPromptDismissed`
- `push.ts:usePushFollowsActingUser` — PUT `/api/notifications/subscription` при смяна на потребителя
- `AppliancesSection.tsx:AppliancesSection` — мутации от `features/appliances`

## Verification
- Run: `pnpm --filter web test src/features/settings`
