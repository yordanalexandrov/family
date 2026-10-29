import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyStoredTheme, useAutoTheme, useTheme } from './theme';

// 4 ноември 2026 в София (UTC+2): 09:00 и 21:00.
const morning = new Date('2026-11-04T07:00:00Z');
const night = new Date('2026-11-04T19:00:00Z');

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Тъмният режим на телефона; `set` го сменя и вика слушателите като браузъра. */
function stubColorScheme(dark: boolean) {
  const listeners = new Set<() => void>();
  let matches = dark;
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return query === DARK_QUERY && matches;
    },
    media: query,
    addEventListener: (_type: string, listener: () => void) => {
      if (query === DARK_QUERY) listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: () => void) => {
      listeners.delete(listener);
    },
  }));
  return {
    set(next: boolean) {
      matches = next;
      for (const listener of listeners) listener();
    },
  };
}

function themeColor(): string | null | undefined {
  return document
    .querySelector('meta[name="theme-color"]')
    ?.getAttribute('content');
}

describe('theme', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete document.documentElement.dataset.theme;
    document.querySelector('meta[name="theme-color"]')?.remove();
  });

  it('family.theme=dark слага data-theme="dark" на <html>', () => {
    localStorage.setItem('family.theme', 'dark');

    applyStoredTheme(morning);

    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('family.theme=light слага data-theme="light" и през нощта', () => {
    localStorage.setItem('family.theme', 'light');

    applyStoredTheme(night);

    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it.each(['phone', 'browser'])(
    'на %s без настройка темата е като телефона: тъмна в 09:00 при тъмен телефон',
    (mode) => {
      localStorage.setItem('family.deviceMode', mode);
      stubColorScheme(true);

      applyStoredTheme(morning);

      expect(document.documentElement.dataset.theme).toBe('dark');
    },
  );

  it.each(['kiosk', 'tv'])(
    'на %s без настройка темата е по часа в София, каквото и да е системата',
    (mode) => {
      localStorage.setItem('family.deviceMode', mode);
      stubColorScheme(true);

      applyStoredTheme(morning);
      expect(document.documentElement.dataset.theme).toBe('light');

      applyStoredTheme(night);
      expect(document.documentElement.dataset.theme).toBe('dark');
    },
  );

  it('изрично „по часа“ на телефон остава по часа', () => {
    localStorage.setItem('family.deviceMode', 'phone');
    localStorage.setItem('family.theme', 'auto');
    stubColorScheme(true);

    applyStoredTheme(morning);

    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('непозната стойност е подразбирането на устройството', () => {
    localStorage.setItem('family.deviceMode', 'kiosk');
    localStorage.setItem('family.theme', 'sepia');
    stubColorScheme(true);

    applyStoredTheme(morning);

    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('„Като телефона“ следва смяната на тъмния режим, докато приложението е отворено', () => {
    localStorage.setItem('family.deviceMode', 'phone');
    const scheme = stubColorScheme(false);
    renderHook(() => useAutoTheme());
    expect(document.documentElement.dataset.theme).toBe('light');

    act(() => scheme.set(true));
    expect(document.documentElement.dataset.theme).toBe('dark');

    act(() => scheme.set(false));
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it.each([
    ['phone', 'system'],
    ['browser', 'system'],
    ['kiosk', 'auto'],
    ['tv', 'auto'],
  ])('без избор настройката на %s е %s', (mode, expected) => {
    localStorage.setItem('family.deviceMode', mode);

    const { result } = renderHook(() => useTheme());

    expect(result.current.setting).toBe(expected);
  });

  it('theme-color е фонът на текущата тема и се сменя с нея', () => {
    localStorage.setItem('family.deviceMode', 'phone');
    const scheme = stubColorScheme(false);
    renderHook(() => useAutoTheme());
    const { result } = renderHook(() => useTheme());
    expect(themeColor()).toBe('#eef1f8');

    act(() => scheme.set(true));
    expect(themeColor()).toBe('#07080f');

    act(() => result.current.setTheme('light'));
    expect(themeColor()).toBe('#eef1f8');
    expect(localStorage.getItem('family.theme')).toBe('light');
  });
});
