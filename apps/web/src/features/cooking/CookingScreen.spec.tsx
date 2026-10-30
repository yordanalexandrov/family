import type { Recipe } from '@family/shared';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dani, server } from '../../test/msw';
import { chickenWithRice } from '../../test/recipes';
import { renderApp, setUpDevice } from '../../test/render';

const HOUR = 60 * 60_000;

function serveRecipe(recipe: Recipe = chickenWithRice) {
  server.use(
    http.get(`/api/recipes/${recipe.id}`, () => HttpResponse.json({ recipe })),
  );
}

/** Подменя Wake Lock API; всеки поискан lock има свой `release`. */
function stubWakeLock() {
  const releases: ReturnType<typeof vi.fn>[] = [];
  const request = vi.fn(async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    releases.push(release);
    return { release, addEventListener: vi.fn() };
  });
  Object.defineProperty(navigator, 'wakeLock', {
    value: { request },
    configurable: true,
  });
  return { request, releases };
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    value: state,
    configurable: true,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, 'wakeLock');
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('Готвене: екранът не гасне', () => {
  it.each(['phone', 'browser'] as const)(
    '%s: wake lock при влизане, отново при видимост, пуснат при излизане',
    async (mode) => {
      const user = userEvent.setup();
      setUpDevice(mode, dani.id);
      serveRecipe();
      const wakeLock = stubWakeLock();

      renderApp(`/recipes/${chickenWithRice.id}`);
      await screen.findByRole('heading', { name: chickenWithRice.title });
      expect(wakeLock.request).not.toHaveBeenCalled();

      await user.click(screen.getByRole('link', { name: 'Готви' }));
      await vi.waitFor(() =>
        expect(wakeLock.request).toHaveBeenCalledWith('screen'),
      );

      setVisibility('hidden');
      setVisibility('visible');
      await vi.waitFor(() => expect(wakeLock.request).toHaveBeenCalledTimes(2));

      // Скритата страница браузърът я пуска сам; при излизане се пуска текущият lock.
      await user.click(screen.getByRole('button', { name: 'Затвори' }));
      await screen.findByRole('heading', { name: chickenWithRice.title });
      expect(wakeLock.releases.at(-1)).toHaveBeenCalled();
    },
  );

  it('kiosk: wake lock-ът не се пуска при излизане от Готвене', async () => {
    const user = userEvent.setup();
    setUpDevice('kiosk');
    serveRecipe();
    const wakeLock = stubWakeLock();

    renderApp(`/recipes/${chickenWithRice.id}`);
    await screen.findByRole('heading', { name: chickenWithRice.title });
    await vi.waitFor(() => expect(wakeLock.request).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('link', { name: 'Готви' }));
    await user.click(await screen.findByRole('button', { name: 'Затвори' }));
    await screen.findByRole('heading', { name: chickenWithRice.title });

    expect(wakeLock.releases.some((release) => release.mock.calls.length)).toBe(
      false,
    );
  });
});

describe('Готвене: връщане на kiosk', () => {
  it('kiosk: 2 часа без докосване връщат на дашборда, а докосване рестартира броенето', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    setUpDevice('kiosk');
    serveRecipe();

    const { router } = renderApp(`/recipes/${chickenWithRice.id}/cook`);
    const step = await screen.findByText(/^Стъпка 1 от/);

    act(() => vi.advanceTimersByTime(HOUR));
    expect(router.state.location.pathname).toBe(
      `/recipes/${chickenWithRice.id}/cook`,
    );
    await user.pointer({ keys: '[MouseLeft]', target: step });

    act(() => vi.advanceTimersByTime(2 * HOUR - 1000));
    expect(router.state.location.pathname).toBe(
      `/recipes/${chickenWithRice.id}/cook`,
    );

    act(() => vi.advanceTimersByTime(1000));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it.each(['phone', 'browser'] as const)(
    '%s: Готвене не се връща само',
    async (mode) => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      setUpDevice(mode, dani.id);
      serveRecipe();

      const { router } = renderApp(`/recipes/${chickenWithRice.id}/cook`);
      await screen.findByText(/^Стъпка 1 от/);

      act(() => vi.advanceTimersByTime(3 * HOUR));
      expect(router.state.location.pathname).toBe(
        `/recipes/${chickenWithRice.id}/cook`,
      );
    },
  );
});
