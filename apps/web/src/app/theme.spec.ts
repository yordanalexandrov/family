import { afterEach, describe, expect, it } from 'vitest';
import { applyStoredTheme } from './theme';

describe('theme', () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
  });

  it('family.theme=dark слага data-theme="dark" на <html>', () => {
    localStorage.setItem('family.theme', 'dark');

    applyStoredTheme();

    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('family.theme=light слага data-theme="light"', () => {
    localStorage.setItem('family.theme', 'light');

    applyStoredTheme();

    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('без стойност или непозната стойност маха data-theme (следва системата)', () => {
    document.documentElement.dataset.theme = 'dark';
    localStorage.setItem('family.theme', 'sepia');

    applyStoredTheme();

    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
