import { useSyncExternalStore } from 'react';
import { isPersonalDevice, readDeviceMode, useDeviceMode } from './device-mode';
import { storedSetting } from './stored-setting';

// Действащ потребител на устройството (GLOSSARY: acting user), пазен в localStorage.
export const ACTING_USER_KEY = 'family.actingUserId';

const actingUser = storedSetting<string | null>({
  key: ACTING_USER_KEY,
  parse: (raw) => raw,
  unset: null,
});

export const readActingUserId = actingUser.read;

export function clearActingUserId(): void {
  actingUser.write(null);
}

export function useActingUser() {
  return {
    actingUserId: useSyncExternalStore(actingUser.subscribe, actingUser.read),
    setActingUserId: actingUser.write,
    clearActingUser: clearActingUserId,
  };
}

/**
 * Кой пише от това устройство: действащият потребител на телефона и в браузъра; на kiosk и TV `null`, дори да е останал
 * запис. Екранът само чете, когато е `null` (оценка, „Аз“, редакция); api клиентът праща него в `X-Acting-User`.
 */
export function readWritingUserId(): string | null {
  return isPersonalDevice(readDeviceMode()) ? readActingUserId() : null;
}

/** `readWritingUserId`, следено от React. */
export function useWritingUserId(): string | null {
  const { mode } = useDeviceMode();
  const { actingUserId } = useActingUser();
  return isPersonalDevice(mode) ? actingUserId : null;
}
