import { themeForHour } from '@family/shared';
import { useEffect, useSyncExternalStore } from 'react';
import { logger } from '../logger';

/*
 * Тема: `family.theme` в localStorage → `data-theme` на <html>. `auto` (без
 * стойност) = по часа в София (`themeForHour`: тъмна от 20:00 до 07:00);
 * `useAutoTheme()` в root layout-а я проверява всяка минута.
 */
export type ThemeSetting = 'light' | 'dark' | 'auto';

export const THEME_KEY = 'family.theme';

const AUTO_CHECK_MS = 60_000;

const listeners = new Set<() => void>();

function readTheme(): ThemeSetting {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : 'auto';
  } catch {
    return 'auto';
  }
}

export function applyStoredTheme(now: Date = new Date()): void {
  const setting = readTheme();
  document.documentElement.dataset.theme =
    setting === 'auto' ? themeForHour(now) : setting;
}

function writeTheme(setting: ThemeSetting): void {
  try {
    if (setting === 'auto') {
      localStorage.removeItem(THEME_KEY);
    } else {
      localStorage.setItem(THEME_KEY, setting);
    }
  } catch (error) {
    logger.warn('localStorage недостъпен', error);
  }
  notify();
}

function notify(): void {
  applyStoredTheme();
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', notify);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', notify);
  };
}

export function useTheme() {
  const setting = useSyncExternalStore(subscribe, readTheme);
  return { setting, setTheme: writeTheme };
}

/** Прилага темата веднага и после всяка минута, за да смени автоматичната в 07:00 и 20:00. */
export function useAutoTheme(): void {
  useEffect(() => {
    applyStoredTheme();
    const timer = setInterval(() => applyStoredTheme(), AUTO_CHECK_MS);
    return () => clearInterval(timer);
  }, []);
}
