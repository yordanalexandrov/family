import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Като текст: статичният екран и скриптът му живеят в index.html, преди bundle-а.
import html from '../../index.html?raw';
import css from '../styles/tokens.css?raw';
import { applyStoredTheme } from './theme';

/*
 * Статичният екран в index.html (#174) избира темата сам, преди React: тук се пази, че прави същото като
 * `applyStoredTheme` и че цветовете му са тези от tokens.css.
 */

const DARK_QUERY = '(prefers-color-scheme: dark)';

// 4 ноември 2026 в София (UTC+2): 09:00 и 21:00.
const morning = new Date('2026-11-04T07:00:00Z');
const night = new Date('2026-11-04T19:00:00Z');

/** Inline скриптът без `src` в <head>. */
function bootScript(): string {
  const match = /<script>([\s\S]*?)<\/script>/.exec(html);
  if (!match?.[1]) {
    throw new Error('Няма inline скрипт в index.html');
  }
  return match[1];
}

/** Статичният `<meta name="theme-color">` от index.html, сложен в <head> на теста. */
function staticThemeColor(): HTMLMetaElement {
  const match = /<meta name="theme-color"[^>]*>/.exec(html);
  if (!match) {
    throw new Error('Няма <meta name="theme-color"> в index.html');
  }
  const template = document.createElement('template');
  template.innerHTML = match[0];
  const meta = template.content.firstElementChild as HTMLMetaElement;
  document.head.append(meta);
  return meta;
}

function stubColorScheme(dark: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === DARK_QUERY && dark,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

interface Setup {
  theme: string | null;
  mode: string | null;
  now: Date;
  systemDark: boolean;
}

function prepare({ theme, mode, now, systemDark }: Setup) {
  localStorage.clear();
  if (theme !== null) localStorage.setItem('family.theme', theme);
  if (mode !== null) localStorage.setItem('family.deviceMode', mode);
  vi.setSystemTime(now);
  stubColorScheme(systemDark);
  delete document.documentElement.dataset.theme;
}

/** Темата и theme-color, които дава скриптът от index.html. */
function runBoot(setup: Setup) {
  prepare(setup);
  const meta = staticThemeColor();
  new Function(bootScript())();
  const result = {
    theme: document.documentElement.dataset.theme,
    color: meta.getAttribute('content'),
  };
  meta.remove();
  return result;
}

/** Темата и theme-color, които дава приложението (`applyStoredTheme`), върху същия статичен таг. */
function runApp(setup: Setup) {
  prepare(setup);
  const meta = staticThemeColor();
  applyStoredTheme(setup.now);
  const result = {
    theme: document.documentElement.dataset.theme,
    color: meta.getAttribute('content'),
  };
  expect(document.querySelectorAll('meta[name="theme-color"]')).toHaveLength(1);
  meta.remove();
  return result;
}

describe('статичният екран в index.html', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('kiosk без тема в 21:00 при светла система е тъмен', () => {
    expect(
      runBoot({ theme: null, mode: 'kiosk', now: night, systemDark: false }),
    ).toEqual({ theme: 'dark', color: '#07080f' });
  });

  it('TV без тема в 09:00 при тъмна система е светъл', () => {
    expect(
      runBoot({ theme: null, mode: 'tv', now: morning, systemDark: true }),
    ).toEqual({ theme: 'light', color: '#eef1f8' });
  });

  it('телефон без тема следва системата и през нощта', () => {
    expect(
      runBoot({ theme: null, mode: 'phone', now: night, systemDark: false }),
    ).toEqual({ theme: 'light', color: '#eef1f8' });
  });

  it('изрично „по часа“ на телефона смята часа', () => {
    expect(
      runBoot({ theme: 'auto', mode: 'phone', now: night, systemDark: false }),
    ).toEqual({ theme: 'dark', color: '#07080f' });
  });

  const themes = [null, 'light', 'dark', 'system', 'auto', 'стара'];
  const modes = [null, 'phone', 'browser', 'kiosk', 'tv'];
  const cases = themes.flatMap((theme) =>
    modes.flatMap((mode) =>
      [morning, night].flatMap((now) =>
        [false, true].map((systemDark) => ({ theme, mode, now, systemDark })),
      ),
    ),
  );

  it.each(cases)(
    'избира като theme.ts: тема $theme, режим $mode, $now, тъмна система $systemDark',
    (setup) => {
      expect(runBoot(setup)).toEqual(runApp(setup));
    },
  );
});

/** Декларациите `--x: y` в първия блок, чийто селектор започва с `selector`. */
function declarations(source: string, selector: string): Map<string, string> {
  const start = source.indexOf(`${selector} {`);
  if (start === -1) {
    throw new Error(`Няма блок ${selector}`);
  }
  const body = source.slice(
    source.indexOf('{', start) + 1,
    source.indexOf('}', start),
  );
  const values = new Map<string, string>();
  for (const match of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    values.set(match[1] ?? '', (match[2] ?? '').trim());
  }
  return values;
}

describe('цветовете на статичния екран', () => {
  const light = declarations(css, ':root');
  const dark = declarations(css, ':root[data-theme="dark"]');

  it.each([
    ['светла', '.boot', light],
    ['тъмна', ":root[data-theme='dark'] .boot", dark],
    ['тъмна по системата', ":root:not([data-theme='light']) .boot", dark],
  ])(
    '%s: фонът и текстът са --color-bg и --color-text-muted',
    (_name, selector, theme) => {
      const boot = declarations(html, selector);

      expect({
        bg: boot.get('--boot-bg'),
        text: boot.get('--boot-text'),
      }).toEqual({
        bg: theme.get('--color-bg'),
        text: theme.get('--color-text-muted'),
      });
    },
  );
});
