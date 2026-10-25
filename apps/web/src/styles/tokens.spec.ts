import { describe, expect, it } from 'vitest';
// Като текст: jsdom не изчислява custom properties от CSS файлове.
import css from './tokens.css?raw';

/** Декларациите `--x: y` в първия блок с точно този селектор. */
function block(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) {
    throw new Error(`Няма блок ${selector}`);
  }
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const tokens = new Map<string, string>();
  for (const match of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    tokens.set(match[1] ?? '', (match[2] ?? '').replace(/\s+/g, ' ').trim());
  }
  return tokens;
}

type Rgba = [number, number, number, number];

function parseColor(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex?.[1]) {
    const n = Number.parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = /^rgba?\(([^)]+)\)$/.exec(value);
  if (rgba?.[1]) {
    const [r = 0, g = 0, b = 0, a = 1] = rgba[1]
      .split(',')
      .map((part) => Number.parseFloat(part));
    return [r, g, b, a];
  }
  throw new Error(`Непознат цвят: ${value}`);
}

function over(top: Rgba, bottom: Rgba): Rgba {
  const a = top[3];
  return [
    top[0] * a + bottom[0] * (1 - a),
    top[1] * a + bottom[1] * (1 - a),
    top[2] * a + bottom[2] * (1 - a),
    1,
  ];
}

function luminance([r, g, b]: Rgba): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

const light = block(':root');
const dark = block(':root[data-theme="dark"]');
const systemDark = block(':root:not([data-theme="light"])');

function token(theme: Map<string, string>, name: string): string {
  const value = theme.get(name) ?? light.get(name);
  if (value === undefined) {
    throw new Error(`Липсва ${name}`);
  }
  return value;
}

const TEXT_TOKENS = [
  '--color-text',
  '--color-text-muted',
  '--color-person-1',
  '--color-person-2',
  '--color-person-family',
  '--color-stale',
];

describe('tokens.css', () => {
  describe.each([
    ['светла', light],
    ['тъмна', dark],
  ])('%s тема', (_name, theme) => {
    // Картата е --glass-bg върху --color-bg (без аурората, най-лошият случай за плътен фон).
    const card = over(
      parseColor(token(theme, '--glass-bg')),
      parseColor(token(theme, '--color-bg')),
    );

    it.each(TEXT_TOKENS)('%s има контраст ≥ 4.5:1 върху картата', (name) => {
      const text = over(parseColor(token(theme, name)), card);

      expect(contrast(text, card)).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('тъмната тема по системата е същата като изричната тъмна', () => {
    expect(Object.fromEntries(systemDark)).toEqual(Object.fromEntries(dark));
  });

  it('тъмната тема не въвежда токени, които светлата няма', () => {
    const missing = [...dark.keys()].filter((name) => !light.has(name));

    expect(missing).toEqual([]);
  });
});
