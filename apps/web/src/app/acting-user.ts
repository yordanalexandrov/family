import { useSyncExternalStore } from 'react';
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
