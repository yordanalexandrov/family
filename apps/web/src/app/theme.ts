// Тема: `family.theme` в localStorage → `data-theme` на <html>. UI за настройка идва с Дашборда.
export type Theme = 'light' | 'dark' | 'auto';

export const THEME_KEY = 'family.theme';

export function readTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : 'auto';
  } catch {
    return 'auto';
  }
}

export function applyTheme(
  theme: Theme,
  root: HTMLElement = document.documentElement,
): void {
  if (theme === 'auto') {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }
}

export function applyStoredTheme(): void {
  applyTheme(readTheme());
}
