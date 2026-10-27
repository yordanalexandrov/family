import { describe, expect, it } from 'vitest';
import { displaySourceUrl, normalizeSourceUrl } from './source-url.js';

describe('normalizeSourceUrl', () => {
  it('drops utm_* and other tracking parameters but keeps the ones that pick the recipe', () => {
    expect(
      normalizeSourceUrl(
        'https://1001recepti.com/recipe/?recipe_id=2439&utm_source=facebook&utm_medium=social&fbclid=abc&gclid=x',
      ),
    ).toBe('https://1001recepti.com/recipe?recipe_id=2439');
  });

  it('drops the fragment and a trailing slash', () => {
    expect(
      normalizeSourceUrl(
        'https://www.recipetineats.com/chicken-chasseur/#wprm-recipe-container',
      ),
    ).toBe('https://www.recipetineats.com/chicken-chasseur');
  });

  it('lowercases the host but not the path', () => {
    expect(normalizeSourceUrl('HTTPS://Recepti.Gotvach.BG/r-5658-Bob/')).toBe(
      'https://recepti.gotvach.bg/r-5658-Bob',
    );
  });

  it('makes the same link pasted twice in different shapes equal', () => {
    expect(
      normalizeSourceUrl(
        'https://Bonapeti.bg/recepti/tikvenik2/?utm_campaign=x#comments',
      ),
    ).toBe(normalizeSourceUrl('https://bonapeti.bg/recepti/tikvenik2'));
  });

  it('keeps the root path of a bare domain', () => {
    expect(normalizeSourceUrl('https://example.com/')).toBe(
      'https://example.com',
    );
  });

  it('makes a Cyrillic path equal to its percent-encoded form, either way round, with or without utm, # and /', () => {
    const encoded =
      'https://recepti.gotvach.bg/r-24078-%D0%9A%D0%BB%D0%B0%D1%81%D0%B8%D1%87%D0%B5%D1%81%D0%BA%D0%BE_%D1%82%D0%B5%D0%BB%D0%B5%D1%88%D0%BA%D0%BE_%D0%B2%D0%B0%D1%80%D0%B5%D0%BD%D0%BE';
    const decoded =
      'https://Recepti.Gotvach.bg/r-24078-Класическо_телешко_варено/?utm_source=viber#comments';
    expect(normalizeSourceUrl(decoded)).toBe(normalizeSourceUrl(encoded));
    expect(normalizeSourceUrl(`${encoded}?utm_medium=share`)).toBe(
      normalizeSourceUrl('https://recepti.gotvach.bg/r-24078-Класическо_телешко_варено'),
    );
  });

  it('gives one form to lowercase and uppercase escapes and to escaped plain letters', () => {
    expect(normalizeSourceUrl('https://example.com/%d0%b1%41?q=%d0%b1')).toBe(
      normalizeSourceUrl('https://example.com/бA?q=б'),
    );
  });

  it('keeps an escaped delimiter apart from the delimiter itself', () => {
    expect(normalizeSourceUrl('https://example.com/a%2Fb?x=1%262')).not.toBe(
      normalizeSourceUrl('https://example.com/a/b?x=1&2'),
    );
  });

  it('leaves a broken escape as it is', () => {
    expect(normalizeSourceUrl('https://example.com/100%25-%D0?q=%zz')).toBe(
      'https://example.com/100%25-%D0?q=%zz',
    );
  });

  it('comes out as a link a browser opens: ASCII only', () => {
    expect(normalizeSourceUrl('https://example.com/торта с ябълки')).toBe(
      'https://example.com/%D1%82%D0%BE%D1%80%D1%82%D0%B0%20%D1%81%20%D1%8F%D0%B1%D1%8A%D0%BB%D0%BA%D0%B8',
    );
  });
});

describe('displaySourceUrl', () => {
  it('shows a percent-encoded link the way people read it', () => {
    expect(
      displaySourceUrl(
        'https://recepti.gotvach.bg/r-24078-%D0%9A%D0%BB%D0%B0%D1%81%D0%B8%D1%87%D0%B5%D1%81%D0%BA%D0%BE',
      ),
    ).toBe('https://recepti.gotvach.bg/r-24078-Класическо');
  });

  it('keeps escaped delimiters and broken escapes', () => {
    expect(displaySourceUrl('https://example.com/a%2Fb%20c?x=1%262')).toBe(
      'https://example.com/a%2Fb c?x=1%262',
    );
    expect(displaySourceUrl('https://example.com/%D0')).toBe(
      'https://example.com/%D0',
    );
  });
});
