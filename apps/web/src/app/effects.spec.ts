import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyStoredEffects, useEffectsLevel } from './effects';

/** Възможностите на браузъра: размазване зад елемент и предпочитание за по-малко движение. */
function stubBrowser({
  blur,
  reducedMotion,
}: {
  blur: boolean;
  reducedMotion: boolean;
}) {
  vi.stubGlobal('CSS', {
    supports: (property: string) =>
      blur &&
      (property === 'backdrop-filter' ||
        property === '-webkit-backdrop-filter'),
  });
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reducedMotion && query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe('effects', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete document.documentElement.dataset.effects;
  });

  it('по подразбиране е full, когато браузърът размазва и движението е позволено', () => {
    stubBrowser({ blur: true, reducedMotion: false });

    applyStoredEffects();

    expect(document.documentElement.dataset.effects).toBe('full');
  });

  it('без поддръжка на backdrop-filter е lite, дори при изрично full', () => {
    stubBrowser({ blur: false, reducedMotion: false });
    localStorage.setItem('family.effects', 'full');

    applyStoredEffects();

    expect(document.documentElement.dataset.effects).toBe('lite');
  });

  it('при prefers-reduced-motion без изрична настройка е lite', () => {
    stubBrowser({ blur: true, reducedMotion: true });

    applyStoredEffects();

    expect(document.documentElement.dataset.effects).toBe('lite');
  });

  it('изричното full печели над prefers-reduced-motion, щом браузърът размазва', () => {
    stubBrowser({ blur: true, reducedMotion: true });
    localStorage.setItem('family.effects', 'full');

    applyStoredEffects();

    expect(document.documentElement.dataset.effects).toBe('full');
  });

  it('изрична настройка се записва в family.effects и се прилага веднага', () => {
    stubBrowser({ blur: true, reducedMotion: false });
    const { result } = renderHook(() => useEffectsLevel());
    expect(result.current.level).toBe('full');

    act(() => result.current.setEffects('lite'));

    expect(localStorage.getItem('family.effects')).toBe('lite');
    expect(result.current).toMatchObject({ level: 'lite', setting: 'lite' });
    expect(document.documentElement.dataset.effects).toBe('lite');
  });

  it('auto маха изричната настройка и връща автоматичното ниво', () => {
    stubBrowser({ blur: true, reducedMotion: true });
    localStorage.setItem('family.effects', 'full');
    const { result } = renderHook(() => useEffectsLevel());

    act(() => result.current.setEffects('auto'));

    expect(localStorage.getItem('family.effects')).toBeNull();
    expect(result.current).toMatchObject({ level: 'lite', setting: 'auto' });
  });
});
