import type { Recipe } from '@family/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { dani, server } from '../../test/msw';
import { chickenWithRice } from '../../test/recipes';
import { renderApp, setUpDevice } from '../../test/render';

/** Продукти: пилешко филе, лук, сол. Филето е в първите две стъпки, лукът във втората, третата е без продукти. */
const stew: Recipe = {
  ...chickenWithRice,
  steps: [
    { text: 'Нарежи филето на ивици.' },
    { text: 'Задуши лука, после добави филето.' },
    { text: 'Разбъркай и сервирай.' },
  ],
};

function serveRecipe(recipe: Recipe = stew) {
  server.use(
    http.get(`/api/recipes/${recipe.id}`, () => HttpResponse.json({ recipe })),
  );
}

/** Имената на редовете в `list`, по реда им на екрана. */
function names(list: HTMLElement): string[] {
  return within(list)
    .getAllByRole('checkbox')
    .map((box) => box.getAttribute('aria-label') ?? '');
}

/** Имената на подчертаните редове: тези, чиято отметка е описана като „в тази стъпка“. */
function stepLines(list: HTMLElement): string[] {
  return within(list)
    .queryAllByRole('checkbox', { description: 'в тази стъпка' })
    .map((box) => box.getAttribute('aria-label') ?? '');
}

describe('Готвене: продуктите на стъпката', () => {
  it('в колоната се подчертават точно редовете на текущата стъпка, на мястото си, и се сменят със стъпката', async () => {
    const user = userEvent.setup();
    setUpDevice('kiosk');
    serveRecipe();

    renderApp(`/recipes/${stew.id}/cook`);
    await screen.findByText('Нарежи филето на ивици.');
    const list = () => screen.getByRole('list', { name: 'Продукти' });

    expect(stepLines(list())).toEqual(['пилешко филе 500 г']);

    await user.click(screen.getByRole('button', { name: 'Напред' }));
    expect(stepLines(list())).toEqual(['пилешко филе 500 г', 'лук 2 бр.']);
    // Всички редове остават, в реда на рецептата.
    expect(names(list())).toEqual([
      'пилешко филе 500 г',
      'лук 2 бр.',
      'сол по вкус',
    ]);

    await user.click(screen.getByRole('button', { name: 'Напред' }));
    expect(stepLines(list())).toEqual([]);
    expect(screen.queryByText('в тази стъпка')).not.toBeInTheDocument();
  });

  it('на тесен екран се подчертават в листа „Продукти“', async () => {
    const user = userEvent.setup();
    stubNarrowScreen();
    setUpDevice('phone', dani.id);
    serveRecipe();

    renderApp(`/recipes/${stew.id}/cook`);
    await user.click(await screen.findByRole('button', { name: 'Напред' }));
    await user.click(screen.getByRole('button', { name: 'Продукти (3)' }));

    const sheet = screen.getByRole('dialog', { name: 'Продукти' });
    expect(
      stepLines(within(sheet).getByRole('list', { name: 'Продукти' })),
    ).toEqual(['пилешко филе 500 г', 'лук 2 бр.']);
  });

  it('отметнат ред на стъпката е подчертан в „Използвани“, а групата не се отваря сама', async () => {
    const user = userEvent.setup();
    setUpDevice('kiosk');
    serveRecipe();

    renderApp(`/recipes/${stew.id}/cook`);
    await user.click(
      await screen.findByRole('checkbox', { name: 'пилешко филе 500 г' }),
    );
    await user.click(screen.getByRole('button', { name: 'Напред' }));

    const usedToggle = screen.getByRole('button', { name: 'Използвани (1)' });
    expect(usedToggle).toHaveAttribute('aria-expanded', 'false');
    expect(stepLines(screen.getByRole('list', { name: 'Продукти' }))).toEqual([
      'лук 2 бр.',
    ]);

    await user.click(usedToggle);
    expect(stepLines(screen.getByRole('list', { name: 'Използвани' }))).toEqual(
      ['пилешко филе 500 г'],
    );
  });

  it.each([
    [false, 'smooth'],
    [true, 'auto'],
  ] as const)(
    'при смяна на стъпката колоната превърта до първия подчертан неотметнат ред (reduced motion: %s)',
    async (reducedMotion, behavior) => {
      const user = userEvent.setup();
      stubReducedMotion(reducedMotion);
      const scrollIntoView = vi.fn();
      const spy = vi
        .spyOn(Element.prototype, 'scrollIntoView')
        .mockImplementation(scrollIntoView);
      onTestFinished(() => spy.mockRestore());
      setUpDevice('kiosk');
      serveRecipe();

      renderApp(`/recipes/${stew.id}/cook`);
      // Филето от първата стъпка е отметнато: първият неотметнат на втората е лукът.
      await user.click(
        await screen.findByRole('checkbox', { name: 'пилешко филе 500 г' }),
      );
      expect(scrollIntoView).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Напред' }));

      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView).toHaveBeenCalledWith({
        block: 'nearest',
        behavior,
      });
      expect(scrollIntoView.mock.contexts[0]).toBe(
        screen.getByRole('checkbox', { name: 'лук 2 бр.' }).closest('li'),
      );

      // Стъпка без продукти на стъпката: нищо не се превърта.
      await user.click(screen.getByRole('button', { name: 'Напред' }));
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
    },
  );
});

/** Телефон в изправено положение: никоя `min-width` медия-заявка не важи. */
function stubNarrowScreen() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });
}

/** `prefers-reduced-motion` по избор; широк екран (колоната), както без `matchMedia`. */
function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? reduce : true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });
}
