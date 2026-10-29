import { themeForHour } from '@family/shared';
import { useEffect, useSyncExternalStore } from 'react';
import {
  type DeviceMode,
  isPersonalDevice,
  readDeviceMode,
  useDeviceMode,
} from './device-mode';
import { storedSetting } from './stored-setting';

/*
 * Тема: `family.theme` в localStorage → `data-theme` на <html>.
 *   system: като телефона (`prefers-color-scheme`, следи промяната му);
 *   auto: по часа в София (`themeForHour`: тъмна от 20:00 до 07:00).
 * Без стойност темата е подразбирането на устройството: `system` на телефон и в
 * браузър, `auto` на kiosk и TV. Така и досегашното `auto` на телефон (то не се
 * пазеше) става „Като телефона“. `useAutoTheme()` в root layout-а проверява часа
 * всяка минута и следи системата. `<meta name="theme-color">` е фонът на темата.
 * Статичният екран в index.html избира темата по същите правила, преди bundle-а;
 * boot-screen.spec.ts пази двете еднакви.
 */
export type ThemeSetting = 'light' | 'dark' | 'system' | 'auto';
type Theme = 'light' | 'dark';

export const THEME_KEY = 'family.theme';

/** `--color-bg` от styles/tokens.css; tokens.spec.ts пази двата еднакви. */
export const THEME_BACKGROUNDS: Record<Theme, string> = {
  light: '#eef1f8',
  dark: '#07080f',
};

const AUTO_CHECK_MS = 60_000;
const DARK_QUERY = '(prefers-color-scheme: dark)';

const theme = storedSetting<ThemeSetting | null>({
  key: THEME_KEY,
  parse: (raw) =>
    raw === 'light' || raw === 'dark' || raw === 'system' || raw === 'auto'
      ? raw
      : null,
  unset: null,
  onChange: () => applyStoredTheme(),
});

/** Без режим (още на „Какво е това устройство?“) — като телефона. */
export function defaultTheme(mode: DeviceMode | null): ThemeSetting {
  return mode === null || isPersonalDevice(mode) ? 'system' : 'auto';
}

function systemTheme(): Theme {
  return typeof matchMedia === 'function' && matchMedia(DARK_QUERY).matches
    ? 'dark'
    : 'light';
}

function resolveTheme(setting: ThemeSetting, now: Date): Theme {
  if (setting === 'system') {
    return systemTheme();
  }
  return setting === 'auto' ? themeForHour(now) : setting;
}

/** Обновява статичния `<meta name="theme-color">` от index.html (без него — създава го). */
function setThemeColor(color: string): void {
  let meta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
  }
  meta.content = color;
}

export function applyStoredTheme(now: Date = new Date()): void {
  const current = resolveTheme(
    theme.read() ?? defaultTheme(readDeviceMode()),
    now,
  );
  document.documentElement.dataset.theme = current;
  setThemeColor(THEME_BACKGROUNDS[current]);
}

export function useTheme() {
  const { mode } = useDeviceMode();
  const stored = useSyncExternalStore(theme.subscribe, theme.read);
  return {
    /** Избраното на устройството; без изричен избор — подразбирането за режима му. */
    setting: stored ?? defaultTheme(mode),
    setTheme: (value: ThemeSetting) => theme.write(value),
  };
}

/**
 * Прилага темата веднага, при смяна на режима на устройството и на тъмния режим на
 * системата, и всяка минута, за да смени „по часа“ в 07:00 и 20:00.
 */
export function useAutoTheme(): void {
  const { mode } = useDeviceMode();
  // biome-ignore lint/correctness/useExhaustiveDependencies: подразбирането зависи от режима, който applyStoredTheme чете сам
  useEffect(() => {
    applyStoredTheme();
  }, [mode]);
  useEffect(() => {
    const update = () => applyStoredTheme();
    const timer = setInterval(update, AUTO_CHECK_MS);
    const media =
      typeof matchMedia === 'function' ? matchMedia(DARK_QUERY) : null;
    media?.addEventListener('change', update);
    return () => {
      clearInterval(timer);
      media?.removeEventListener('change', update);
    };
  }, []);
}
