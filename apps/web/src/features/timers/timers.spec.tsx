import type { Recipe } from '@family/shared';
import { act, cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dani, server } from '../../test/msw';
import { chickenWithRice, omelette } from '../../test/recipes';
import { renderApp, setUpDevice } from '../../test/render';

const MINUTE = 60_000;

const stew: Recipe = {
  ...chickenWithRice,
  steps: [
    { text: 'Нарежи пилето.' },
    { text: 'Пържи 15 мин до златисто, после задуши 10–15 мин.' },
  ],
};

function serveRecipes(...recipes: Recipe[]) {
  server.use(
    ...recipes.map((recipe) =>
      http.get(`/api/recipes/${recipe.id}`, () =>
        HttpResponse.json({ recipe }),
      ),
    ),
  );
}

/** Фалшив часовник, който не спира userEvent и findBy. */
function fakeClock() {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

function strip() {
  return screen.getByRole('region', { name: 'Таймери' });
}

function timerRows() {
  return within(strip()).getAllByRole('listitem');
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Таймери в Готвене', () => {
  it.each(['kiosk', 'phone'] as const)(
    'времето в текста на стъпката е бутон, който пуска таймер в лентата (%s)',
    async (mode) => {
      const user = fakeClock();
      setUpDevice(mode, mode === 'kiosk' ? undefined : dani.id);
      serveRecipes(stew);

      renderApp(`/recipes/${stew.id}/cook`);
      await user.click(await screen.findByRole('button', { name: 'Напред' }));

      const text = screen.getByText(/^Пържи/);
      expect(text).toHaveTextContent(
        'Пържи ⏱15 мин до златисто, после задуши ⏱10–15 мин.',
      );
      expect(screen.queryByRole('region', { name: 'Таймери' })).toBeNull();

      await user.click(
        within(text).getByRole('button', { name: 'Таймер 15 мин' }),
      );

      const [row] = timerRows();
      // В собствената рецепта надписът е без заглавието ѝ.
      expect(row).toHaveTextContent(/^Стъпка 2 · 15 мин/);
      expect(row).toHaveTextContent('15:00');

      act(() => vi.advanceTimersByTime(MINUTE));
      expect(row).toHaveTextContent('14:00');
    },
  );

  it('няколко таймера броят паралелно, а интервалът брои до долната граница', async () => {
    const user = fakeClock();
    setUpDevice('kiosk');
    serveRecipes(stew);

    renderApp(`/recipes/${stew.id}/cook`);
    await user.click(await screen.findByRole('button', { name: 'Напред' }));
    await user.click(screen.getByRole('button', { name: 'Таймер 15 мин' }));
    act(() => vi.advanceTimersByTime(MINUTE));
    await user.click(screen.getByRole('button', { name: 'Таймер 10–15 мин' }));
    act(() => vi.advanceTimersByTime(2 * MINUTE));

    const [fry, simmer] = timerRows();
    expect(fry).toHaveTextContent('Стъпка 2 · 15 мин');
    expect(fry).toHaveTextContent('12:00');
    expect(simmer).toHaveTextContent('Стъпка 2 · 10–15 мин');
    expect(simmer).toHaveTextContent('8:00');
  });

  it('лентата е на всяка стъпка', async () => {
    const user = fakeClock();
    setUpDevice('kiosk');
    serveRecipes(stew);

    renderApp(`/recipes/${stew.id}/cook`);
    await user.click(await screen.findByRole('button', { name: 'Напред' }));
    await user.click(screen.getByRole('button', { name: 'Таймер 15 мин' }));
    await user.click(screen.getByRole('button', { name: 'Назад' }));

    expect(screen.getByText('Нарежи пилето.')).toBeInTheDocument();
    expect(timerRows()[0]).toHaveTextContent('Стъпка 2 · 15 мин');
  });

  it('изтеклият таймер остава в лентата като изтекъл', async () => {
    const user = fakeClock();
    setUpDevice('kiosk');
    serveRecipes(stew);

    renderApp(`/recipes/${stew.id}/cook`);
    await user.click(await screen.findByRole('button', { name: 'Напред' }));
    await user.click(screen.getByRole('button', { name: 'Таймер 15 мин' }));
    act(() => vi.advanceTimersByTime(15 * MINUTE - 1000));
    expect(timerRows()[0]).toHaveTextContent('0:01');

    act(() => vi.advanceTimersByTime(1000));
    const [row] = timerRows();
    expect(row).toHaveTextContent('Стъпка 2 · 15 мин');
    expect(row).toHaveTextContent('Изтече');
  });

  it('таймер от друга рецепта се вижда в Готвене ѝ със заглавието на рецептата си', async () => {
    const user = fakeClock();
    setUpDevice('phone', dani.id);
    serveRecipes(stew, omelette);

    const { router } = renderApp(`/recipes/${stew.id}/cook`);
    await user.click(await screen.findByRole('button', { name: 'Напред' }));
    await user.click(screen.getByRole('button', { name: 'Таймер 15 мин' }));
    act(() => vi.advanceTimersByTime(MINUTE));

    await act(() =>
      router.navigate({
        to: '/recipes/$id/cook',
        params: { id: omelette.id },
      }),
    );
    expect(await screen.findByText('Разбий яйцата.')).toBeInTheDocument();

    const [row] = timerRows();
    expect(row).toHaveTextContent(`${stew.title} · Стъпка 2 · 15 мин`);
    expect(row).toHaveTextContent('14:00');
  });

  it('след презареждане таймерът продължава, а изтеклият междувременно казва преди колко минути', async () => {
    const user = fakeClock();
    setUpDevice('kiosk');
    serveRecipes(stew);

    renderApp(`/recipes/${stew.id}/cook`);
    await user.click(await screen.findByRole('button', { name: 'Напред' }));
    await user.click(screen.getByRole('button', { name: 'Таймер 15 мин' }));
    await user.click(screen.getByRole('button', { name: 'Таймер 10–15 мин' }));

    // Готвене се затваря (презареждане, заспал телефон) и се отваря след 12 минути.
    cleanup();
    act(() => vi.advanceTimersByTime(12 * MINUTE));
    renderApp(`/recipes/${stew.id}/cook`);

    // Готвене помни и стъпката.
    expect(await screen.findByText(/^Пържи/)).toBeInTheDocument();
    const [fry, simmer] = timerRows();
    expect(fry).toHaveTextContent('Стъпка 2 · 15 мин');
    expect(fry).toHaveTextContent('3:00');
    expect(simmer).toHaveTextContent('Изтече преди 2 мин');

    act(() => vi.advanceTimersByTime(MINUTE));
    expect(timerRows()[1]).toHaveTextContent('Изтече преди 3 мин');
  });
});
