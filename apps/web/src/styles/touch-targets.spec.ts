import { describe, expect, it } from 'vitest';

// Като текст: jsdom не изчислява размери; истинските правоъгълници се мерят с verify-family.
const sheets = import.meta.glob<string>('../**/*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** Размерите, с които една цел за докосване става по-малка от 48 px (3rem), без 0 и без тънките декорации. */
const SIZE =
  /(?:^|[;\s{])((?:min-)?(?:block-size|inline-size|height|width))\s*:\s*([\d.]+)rem/g;

/**
 * Правила, които не са цели за докосване на телефона, с причината. Всичко друго с размер между 2rem и 3rem е
 * цел, която е под 48 dp.
 */
const NOT_PHONE_TARGETS = new Map([
  ['.spinner__ring', 'индикатор, не се докосва'],
  [
    '.main-nav__link',
    'хапчето на горната лента в „Браузър“ (мишка); долната лента е с px',
  ],
  ['.main-nav--top .main-nav__link', 'горната лента в „Браузър“ (мишка)'],
]);

function undersized(): string[] {
  const found: string[] = [];
  for (const [file, css] of Object.entries(sheets)) {
    const plain = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const rule of plain.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = (rule[1] ?? '').trim().replace(/\s+/g, ' ');
      if (NOT_PHONE_TARGETS.has(selector)) {
        continue;
      }
      for (const [, property, value] of (rule[2] ?? '').matchAll(SIZE)) {
        const rem = Number(value);
        if (rem >= 2 && rem < 3) {
          found.push(`${file} ${selector} { ${property}: ${value}rem }`);
        }
      }
    }
  }
  return found;
}

describe('цели за докосване', () => {
  it('стиловете не дават на цел размер под 48 px (3rem)', () => {
    expect(Object.keys(sheets).length).toBeGreaterThan(10);
    expect(undersized()).toEqual([]);
  });
});
