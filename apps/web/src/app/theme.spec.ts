import { afterEach, describe, expect, it } from 'vitest';
import { applyStoredTheme } from './theme';

// 4 ноември 2026 в София (UTC+2).
const noon = new Date('2026-11-04T10:00:00Z');
const night = new Date('2026-11-04T19:00:00Z');

describe('theme', () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
  });

  it('family.theme=dark слага data-theme="dark" на <html>', () => {
    localStorage.setItem('family.theme', 'dark');

    applyStoredTheme(noon);

    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('family.theme=light слага data-theme="light" и през нощта', () => {
    localStorage.setItem('family.theme', 'light');

    applyStoredTheme(night);

    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('без стойност или с непозната стойност темата е по часа в София', () => {
    localStorage.setItem('family.theme', 'sepia');

    applyStoredTheme(noon);
    expect(document.documentElement.dataset.theme).toBe('light');

    applyStoredTheme(night);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
