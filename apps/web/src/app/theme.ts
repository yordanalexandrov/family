// Тема: `family.theme` в localStorage → `data-theme` на <html>. UI за настройка идва с Дашборда.
type Theme = 'light' | 'dark' | 'auto';

const THEME_KEY = 'family.theme';

function readTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : 'auto';
  } catch {
    return 'auto';
  }
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'auto') {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }
}

export function applyStoredTheme(): void {
  applyTheme(readTheme());
}
