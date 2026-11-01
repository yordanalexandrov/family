import type { Recipe } from '@family/shared';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dani, server } from '../../test/msw';
import { chickenWithRice, omelette } from '../../test/recipes';
import { renderApp, setUpDevice } from '../../test/render';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const stew: Recipe = {
  ...chickenWithRice,
  steps: [
    { text: 'Нарежи пилето.' },
    { text: 'Пържи 15 мин до златисто, после задуши 10–15 мин.' },
  ],
};

const cookPath = `/recipes/${stew.id}/cook`;

function serveRecipes(...recipes: Recipe[]) {
  server.use(
    ...recipes.map((recipe) =>
      http.get(`/api/recipes/${recipe.id}`, () =>
        HttpResponse.json({ recipe }),
      ),
    ),
  );
}

/**
 * Фалшив часовник, който не спира userEvent и findBy. Почва по обед: изтекъл таймер изчезва в полунощ (София), а
 * тестовете превъртат до часове напред — пуснати късно вечер, не бива да минат през нея.
 */
function fakeClock() {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-10-30T12:00:00+02:00'));
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

function confirmation() {
  return screen.queryByRole('alertdialog', { name: 'Излизане от Готвене' });
}

/** Влиза в Готвене от изгледа на рецептата (има къде да се върне) и е на последната стъпка. */
async function cookFromRecipe(user: ReturnType<typeof fakeClock>) {
  const rendered = renderApp(`/recipes/${stew.id}`);
  await user.click(await screen.findByRole('link', { name: 'Готви' }));
  await user.click(await screen.findByRole('button', { name: 'Напред' }));
  return rendered;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Излизане от Готвене с таймер', () => {
  it('без таймер „Готово“ излиза без потвърждение', async () => {
    const user = fakeClock();
    setUpDevice('phone', dani.id);
    serveRecipes(stew);

    const { router } = await cookFromRecipe(user);
    await user.click(screen.getByRole('button', { name: 'Готово' }));
    await user.click(await screen.findByRole('button', { name: 'Пропусни' }));

    await screen.findByRole('heading', { name: stew.title });
    expect(router.state.location.pathname).toBe(`/recipes/${stew.id}`);
    expect(confirmation()).toBeNull();
  });

  it.each(['Готово', 'Затвори'])(
    'с работещ таймер „%s“ пита, „Остани“ оставя Готвене отворено',
    async (button) => {
      const user = fakeClock();
      setUpDevice('phone', dani.id);
      serveRecipes(stew);

      const { router } = await cookFromRecipe(user);
      await user.click(screen.getByRole('button', { name: 'Таймер 15 мин' }));
      await user.click(screen.getByRole('button', { name: button }));
      if (button === 'Готово') {
        await user.click(
          await screen.findByRole('button', { name: 'Пропусни' }),
        );
      }

      const dialog = await screen.findByRole('alertdialog', {
        name: 'Излизане от Готвене',
      });
      expect(dialog).toHaveTextContent(
        'Има 1 работещ таймер. Излизането го спира от звънене.',
      );
      await user.click(within(dialog).getByRole('button', { name: 'Остани' }));

      expect(confirmation()).toBeNull();
      expect(router.state.location.pathname).toBe(cookPath);
      expect(screen.getByText(/^Стъпка 2 от/)).toBeInTheDocument();
    },
  );

  it('„Излез“ излиза, без да отменя таймерите', async () => {
    const user = fakeClock();
    setUpDevice('kiosk');
    serveRecipes(stew);

    const { router } = await cookFromRecipe(user);
    await user.click(screen.getByRole('button', { name: 'Таймер 15 мин' }));
    await user.click(screen.getByRole('button', { name: 'Таймер 10–15 мин' }));
    await user.click(screen.getByRole('button', { name: 'Готово' }));
    await user.click(await screen.findByRole('button', { name: 'Пропусни' }));

    const dialog = await screen.findByRole('alertdialog', {
      name: 'Излизане от Готвене',
    });
    expect(dialog).toHaveTextContent(
      'Има 2 работещи таймера. Излизането ги спира от звънене.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Излез' }));

    await screen.findByRole('heading', { name: stew.title });
    expect(router.state.location.pathname).toBe(`/recipes/${stew.id}`);

    // Обратно в Готвене таймерите още броят.
    act(() => vi.advanceTimersByTime(MINUTE));
    await act(() => router.navigate({ to: cookPath }));
    const strip = await screen.findByRole('region', { name: 'Таймери' });
    expect(within(strip).getAllByRole('listitem')).toHaveLength(2);
    expect(strip).toHaveTextContent('14:00');
  });

  // „Назад“ на системата е popstate, който history в паметта не спира; него го показва verify-family в браузъра.
  it('навигация извън Готвене с работещ таймер пита', async () => {
    const user = fakeClock();
    setUpDevice('phone', dani.id);
    serveRecipes(stew);

    const { router } = await cookFromRecipe(user);
    await user.click(screen.getByRole('button', { name: 'Таймер 15 мин' }));
    // Без await: навигацията чака отговора на потвърждението.
    act(() => {
      void router.navigate({ to: '/recipes' });
    });

    const dialog = await screen.findByRole('alertdialog', {
      name: 'Излизане от Готвене',
    });
    expect(router.state.location.pathname).toBe(cookPath);
    await user.click(within(dialog).getByRole('button', { name: 'Излез' }));
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe('/recipes'),
    );
  });

  it('изтеклият, още неспрян таймер също пита', async () => {
    const user = fakeClock();
    setUpDevice('kiosk');
    serveRecipes(stew);

    await cookFromRecipe(user);
    await user.click(screen.getByRole('button', { name: 'Таймер 15 мин' }));
    act(() => vi.advanceTimersByTime(20 * MINUTE));
    await user.click(screen.getByRole('button', { name: 'Затвори' }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      'Има 1 работещ таймер.',
    );
  });

  it('преминаването към Готвене на друга рецепта не е излизане', async () => {
    const user = fakeClock();
    setUpDevice('phone', dani.id);
    serveRecipes(stew, omelette);

    const { router } = await cookFromRecipe(user);
    await user.click(screen.getByRole('button', { name: 'Таймер 15 мин' }));
    await act(() =>
      router.navigate({
        to: '/recipes/$id/cook',
        params: { id: omelette.id },
      }),
    );

    expect(await screen.findByText('Разбий яйцата.')).toBeInTheDocument();
    expect(confirmation()).toBeNull();
  });

  it('kiosk: с работещ таймер Готвене не се връща само на дашборда', async () => {
    const user = fakeClock();
    setUpDevice('kiosk');
    serveRecipes(stew);

    const { router } = renderApp(cookPath);
    await user.click(await screen.findByRole('button', { name: 'Напред' }));
    await user.click(screen.getByRole('button', { name: 'Таймер 15 мин' }));

    act(() => vi.advanceTimersByTime(3 * HOUR));
    expect(router.state.location.pathname).toBe(cookPath);
    expect(confirmation()).toBeNull();
  });

  it('kiosk без презареждане: в края на деня изтеклият неспрян таймер изчезва и Готвене пак се връща на дашборда', async () => {
    const user = fakeClock();
    vi.setSystemTime(new Date('2026-10-31T21:00:00+02:00'));
    setUpDevice('kiosk');
    serveRecipes(stew);

    const { router } = renderApp(cookPath);
    await user.click(await screen.findByRole('button', { name: 'Напред' }));
    await user.click(screen.getByRole('button', { name: 'Таймер 15 мин' }));

    // 23:59: изтекъл преди повече от 2 часа, още неспрян — Готвене чака.
    await act(() => vi.advanceTimersByTimeAsync(2 * HOUR + 59 * MINUTE));
    expect(router.state.location.pathname).toBe(cookPath);
    expect(screen.getByRole('alert')).toHaveTextContent('Стъпка 2 · 15 мин');

    await act(() => vi.advanceTimersByTimeAsync(2 * MINUTE));
    expect(screen.queryByRole('region', { name: 'Таймери' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();

    await act(() => vi.advanceTimersByTimeAsync(2 * HOUR));
    expect(router.state.location.pathname).toBe('/');
  });

  /** kiosk в Готвене на стъпка 2 с таймер „15 мин“, отворено менюто му. */
  async function kioskTimerMenu(user: ReturnType<typeof fakeClock>) {
    const rendered = renderApp(cookPath);
    await user.click(await screen.findByRole('button', { name: 'Напред' }));
    await user.click(screen.getByRole('button', { name: 'Таймер 15 мин' }));
    const strip = screen.getByRole('region', { name: 'Таймери' });
    await user.click(
      within(strip).getByRole('button', { name: /^Стъпка 2 · 15 мин/ }),
    );
    return {
      ...rendered,
      menu: screen.getByRole('dialog', { name: 'Стъпка 2 · 15 мин' }),
    };
  }

  it('kiosk: щом последният таймер е отменен, връщането на дашборда пак се случва', async () => {
    const user = fakeClock();
    setUpDevice('kiosk');
    serveRecipes(stew);

    const { router, menu } = await kioskTimerMenu(user);
    act(() => vi.advanceTimersByTime(3 * HOUR));
    expect(router.state.location.pathname).toBe(cookPath);

    await user.click(within(menu).getByRole('button', { name: 'Отмени' }));
    // Навигацията на router-а завършва в microtask-ове: асинхронното превъртане ги изчаква.
    await act(() => vi.advanceTimersByTimeAsync(2 * HOUR));

    expect(router.state.location.pathname).toBe('/');
  });

  it('след отмяна на последния таймер „Затвори“ излиза без потвърждение', async () => {
    const user = fakeClock();
    setUpDevice('kiosk');
    serveRecipes(stew);

    const { router, menu } = await kioskTimerMenu(user);
    await user.click(within(menu).getByRole('button', { name: 'Отмени' }));
    await user.click(screen.getByRole('button', { name: 'Затвори' }));

    expect(confirmation()).toBeNull();
    expect(router.state.location.pathname).not.toBe(cookPath);
  });

  it('таймер на пауза не е работещ: не пита при излизане и не спира връщането на kiosk', async () => {
    const user = fakeClock();
    setUpDevice('kiosk');
    serveRecipes(stew);

    const { router, menu } = await kioskTimerMenu(user);
    await user.click(within(menu).getByRole('button', { name: 'Пауза' }));
    await user.click(within(menu).getByRole('button', { name: 'Готово' }));
    await act(() => vi.advanceTimersByTimeAsync(2 * HOUR));

    expect(confirmation()).toBeNull();
    expect(router.state.location.pathname).toBe('/');
  });
});
