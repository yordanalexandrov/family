import { themeForHour } from '@family/shared';
import { useEffect, useSyncExternalStore } from 'react';
import { storedSetting } from './stored-setting';

/*
 * Тема: `family.theme` в localStorage → `data-theme` на <html>. `auto` (без
 * стойност) = по часа в София (`themeForHour`: тъмна от 20:00 до 07:00);
 * `useAutoTheme()` в root layout-а я проверява всяка минута.
 */
export type ThemeSetting = 'light' | 'dark' | 'auto';

export const THEME_KEY = 'family.theme';

const AUTO_CHECK_MS = 60_000;

const theme = storedSetting<ThemeSetting>({
  key: THEME_KEY,
  parse: (raw) => (raw === 'light' || raw === 'dark' ? raw : 'auto'),
  unset: 'auto',
  onChange: () => applyStoredTheme(),
});

export function applyStoredTheme(now: Date = new Date()): void {
  const setting = theme.read();
  document.documentElement.dataset.theme =
    setting === 'auto' ? themeForHour(now) : setting;
}

export function useTheme() {
  return {
    setting: useSyncExternalStore(theme.subscribe, theme.read),
    setTheme: theme.write,
  };
}

/** Прилага темата веднага и после всяка минута, за да смени автоматичната в 07:00 и 20:00. */
export function useAutoTheme(): void {
  useEffect(() => {
    applyStoredTheme();
    const timer = setInterval(() => applyStoredTheme(), AUTO_CHECK_MS);
    return () => clearInterval(timer);
  }, []);
}
