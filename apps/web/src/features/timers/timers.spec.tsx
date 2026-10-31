import type { Recipe } from '@family/shared';
import { act, screen, within } from '@testing-library/react';
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
});

describe('Действия с пуснат таймер', () => {
  /** Готвене на `stew`, стъпка 2, с пуснат таймер „15 мин“. */
  async function cookWithTimer(mode: 'kiosk' | 'phone' = 'kiosk') {
    const user = fakeClock();
    setUpDevice(mode, mode === 'kiosk' ? undefined : dani.id);
    serveRecipes(stew);
    renderApp(`/recipes/${stew.id}/cook`);
    await user.click(await screen.findByRole('button', { name: 'Напред' }));
    await user.click(screen.getByRole('button', { name: 'Таймер 15 мин' }));
    return user;
  }

  async function openMenu(user: ReturnType<typeof fakeClock>) {
    await user.click(
      within(strip()).getByRole('button', { name: /^Стъпка 2 · 15 мин/ }),
    );
    return screen.getByRole('dialog', { name: 'Стъпка 2 · 15 мин' });
  }

  it.each(['kiosk', 'phone'] as const)(
    'докосване на таймера отваря менюто, а „+1 мин“ добавя минута (%s)',
    async (mode) => {
      const user = await cookWithTimer(mode);
      act(() => vi.advanceTimersByTime(5 * MINUTE));

      const menu = await openMenu(user);
      expect(menu).toHaveTextContent('10:00');
      await user.click(within(menu).getByRole('button', { name: '+1 мин' }));

      expect(menu).toHaveTextContent('11:00');
      expect(timerRows()[0]).toHaveTextContent('11:00');
    },
  );

  it('„Пауза“ спира броенето и се вижда в лентата, а „Продължи“ брои от същото време', async () => {
    const user = await cookWithTimer();
    act(() => vi.advanceTimersByTime(5 * MINUTE));

    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('button', { name: 'Пауза' }));
    act(() => vi.advanceTimersByTime(3 * MINUTE));
    expect(timerRows()[0]).toHaveTextContent('На пауза');
    expect(timerRows()[0]).toHaveTextContent('10:00');

    await user.click(within(menu).getByRole('button', { name: 'Продължи' }));
    act(() => vi.advanceTimersByTime(MINUTE));
    expect(timerRows()[0]).not.toHaveTextContent('На пауза');
    expect(timerRows()[0]).toHaveTextContent('9:00');
  });

  it('„Повтори“ пуска същото време отначало и затваря менюто', async () => {
    const user = await cookWithTimer();
    act(() => vi.advanceTimersByTime(5 * MINUTE));

    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('button', { name: 'Повтори' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(timerRows()[0]).toHaveTextContent('15:00');
  });

  it('„Отмени“ маха таймера от лентата', async () => {
    const user = await cookWithTimer();

    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('button', { name: 'Отмени' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Таймери' })).toBeNull();
  });

  it('изтекъл таймер е без „Пауза“, а „+1 мин“ брои минута от сега', async () => {
    const user = await cookWithTimer();
    act(() => vi.advanceTimersByTime(20 * MINUTE));

    const menu = await openMenu(user);
    expect(within(menu).queryByRole('button', { name: 'Пауза' })).toBeNull();
    await user.click(within(menu).getByRole('button', { name: '+1 мин' }));

    expect(timerRows()[0]).toHaveTextContent('1:00');
  });
});
