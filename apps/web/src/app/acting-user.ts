import { useSyncExternalStore } from 'react';
import { logger } from '../logger';

// Действащ потребител на устройството (GLOSSARY: acting user), пазен в localStorage.
export const ACTING_USER_KEY = 'family.actingUserId';

const listeners = new Set<() => void>();

export function readActingUserId(): string | null {
  try {
    return localStorage.getItem(ACTING_USER_KEY);
  } catch (error) {
    logger.warn('localStorage недостъпен', error);
    return null;
  }
}

export function writeActingUserId(id: string): void {
  try {
    localStorage.setItem(ACTING_USER_KEY, id);
  } catch (error) {
    logger.warn('localStorage недостъпен', error);
  }
  notify();
}

export function clearActingUserId(): void {
  try {
    localStorage.removeItem(ACTING_USER_KEY);
  } catch (error) {
    logger.warn('localStorage недостъпен', error);
  }
  notify();
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Смяна от друг таб на същото устройство.
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

export function useActingUser() {
  const actingUserId = useSyncExternalStore(subscribe, readActingUserId);
  return {
    actingUserId,
    setActingUserId: writeActingUserId,
    clearActingUser: clearActingUserId,
  };
}
