import { describe, expect, it } from 'vitest';
import { normalizeSourceUrl } from './source-url.js';

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
});
