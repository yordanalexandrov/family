import type { Recipe } from '@family/shared';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { dani, server } from '../../test/msw';
import { chickenWithRice } from '../../test/recipes';
import { renderApp, setUpDevice } from '../../test/render';

const stew: Recipe = {
  ...chickenWithRice,
  steps: ['Нарежи пилето.', 'Задуши с лука.', 'Посоли и сервирай.'],
};

function serveRecipe(recipe: Recipe = stew) {
  server.use(
    http.get(`/api/recipes/${recipe.id}`, () => HttpResponse.json({ recipe })),
  );
}

describe('Готвене', () => {
  it.each(['kiosk', 'phone', 'browser'] as const)(
    '„Готви“ в изгледа на рецептата отваря Готвене (%s)',
    async (mode) => {
      const user = userEvent.setup();
      setUpDevice(mode, mode === 'kiosk' ? undefined : dani.id);
      serveRecipe();

      renderApp(`/recipes/${stew.id}`);
      await user.click(await screen.findByRole('link', { name: 'Готви' }));

      expect(await screen.findByText('Стъпка 1 от 3')).toBeInTheDocument();
      expect(screen.getByText('Нарежи пилето.')).toBeInTheDocument();
    },
  );

  it('на TV изгледът на рецептата няма „Готви“', async () => {
    setUpDevice('tv');
    serveRecipe();

    renderApp(`/recipes/${stew.id}`);

    await screen.findByRole('heading', { name: 'Пиле с ориз' });
    expect(
      screen.queryByRole('link', { name: 'Готви' }),
    ).not.toBeInTheDocument();
  });

  it('„Напред“ и „Назад“ сменят стъпката, без да излизат извън обхвата', async () => {
    const user = userEvent.setup();
    setUpDevice('kiosk');
    serveRecipe();

    renderApp(`/recipes/${stew.id}/cook`);

    expect(await screen.findByText('Стъпка 1 от 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Назад' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Напред' }));
    expect(screen.getByText('Стъпка 2 от 3')).toBeInTheDocument();
    expect(screen.getByText('Задуши с лука.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Назад' }));
    expect(screen.getByText('Стъпка 1 от 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Напред' }));
    await user.click(screen.getByRole('button', { name: 'Напред' }));
    expect(screen.getByText('Стъпка 3 от 3')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Напред' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Готово' })).toBeInTheDocument();
  });

  it('точките прескачат до стъпката си и показват текущата', async () => {
    const user = userEvent.setup();
    setUpDevice('kiosk');
    serveRecipe();

    renderApp(`/recipes/${stew.id}/cook`);

    const dots = within(
      await screen.findByRole('group', { name: 'Към стъпка' }),
    ).getAllByRole('button');
    expect(dots).toHaveLength(3);
    expect(dots[0]).toHaveAttribute('aria-current', 'step');

    await user.click(screen.getByRole('button', { name: 'Стъпка 3' }));

    expect(screen.getByText('Стъпка 3 от 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Стъпка 3' })).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(
      screen.getByRole('button', { name: 'Стъпка 1' }),
    ).not.toHaveAttribute('aria-current');
  });

  it('плъзгане наляво води напред, надясно назад, без да излиза извън обхвата', async () => {
    setUpDevice('kiosk');
    serveRecipe();

    renderApp(`/recipes/${stew.id}/cook`);
    await screen.findByText('Стъпка 1 от 3');
    const steps = screen.getByRole('region', { name: 'Стъпки' });

    swipe(steps, 300, 100);
    expect(screen.getByText('Стъпка 2 от 3')).toBeInTheDocument();
    swipe(steps, 100, 300);
    expect(screen.getByText('Стъпка 1 от 3')).toBeInTheDocument();
    swipe(steps, 100, 300);
    expect(screen.getByText('Стъпка 1 от 3')).toBeInTheDocument();

    swipe(steps, 300, 100);
    swipe(steps, 300, 100);
    swipe(steps, 300, 100);
    expect(screen.getByText('Стъпка 3 от 3')).toBeInTheDocument();

    // Почти вертикален жест (превъртане) не сменя стъпката.
    swipe(steps, 100, 300, { fromY: 0, toY: 400 });
    expect(screen.getByText('Стъпка 3 от 3')).toBeInTheDocument();
  });

  it('„Готово“ на последната стъпка връща към предишния екран', async () => {
    const user = userEvent.setup();
    setUpDevice('kiosk');
    serveRecipe();
    server.use(
      http.get('/api/recipes', () => HttpResponse.json({ recipes: [] })),
    );

    const { router } = renderApp('/recipes');
    await router.navigate({ to: '/recipes/$id', params: { id: stew.id } });
    await user.click(await screen.findByRole('link', { name: 'Готви' }));
    await user.click(await screen.findByRole('button', { name: 'Стъпка 3' }));
    await user.click(screen.getByRole('button', { name: 'Готово' }));

    expect(
      await screen.findByRole('heading', { name: 'Пиле с ориз' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/recipes/${stew.id}`);
  });

  it('„Готово“ без предишен екран отваря изгледа на рецептата', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    serveRecipe();

    const { router } = renderApp(`/recipes/${stew.id}/cook`);
    await user.click(await screen.findByRole('button', { name: 'Стъпка 3' }));
    await user.click(screen.getByRole('button', { name: 'Готово' }));

    expect(
      await screen.findByRole('heading', { name: 'Пиле с ориз' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/recipes/${stew.id}`);
  });

  it('колоната „Продукти“ е отворена при влизане и се прибира и отваря с бутон', async () => {
    const user = userEvent.setup();
    setUpDevice('kiosk');
    serveRecipe();

    renderApp(`/recipes/${stew.id}/cook`);

    const list = await screen.findByRole('list', { name: 'Продукти' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['пилешко филе500 г', 'лук2 бр.', 'солпо вкус']);

    await user.click(
      screen.getByRole('button', { name: 'Прибери продуктите' }),
    );

    expect(
      screen.queryByRole('list', { name: 'Продукти' }),
    ).not.toBeInTheDocument();
    const strip = screen.getByRole('button', { name: 'Продукти (3)' });
    expect(strip).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Стъпка 1 от 3')).toBeInTheDocument();

    await user.click(strip);

    expect(screen.getByRole('list', { name: 'Продукти' })).toBeInTheDocument();
  });

  it('−/+ пресмятат количествата наново само на екрана, а „по вкус“ остава без число', async () => {
    const user = userEvent.setup();
    setUpDevice('kiosk');
    serveRecipe();
    let writes = 0;
    const countWrites = ({ request }: { request: Request }) => {
      if (request.method !== 'GET') {
        writes += 1;
      }
    };
    server.events.on('request:start', countWrites);
    onTestFinished(() => {
      server.events.removeListener('request:start', countWrites);
    });

    renderApp(`/recipes/${stew.id}/cook`);

    expect(await screen.findByText('за 4 порции')).toBeInTheDocument();
    const more = screen.getByRole('button', { name: 'Една порция повече' });
    for (let i = 0; i < 4; i += 1) {
      await user.click(more);
    }

    expect(screen.getByText('за 8 порции')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Продукти' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['пилешко филе1 кг', 'лук4 бр.', 'солпо вкус']);

    const fewer = screen.getByRole('button', { name: 'Една порция по-малко' });
    for (let i = 0; i < 7; i += 1) {
      await user.click(fewer);
    }

    expect(screen.getByText('за 1 порция')).toBeInTheDocument();
    expect(fewer).toBeDisabled();
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['пилешко филе125 г', 'лук0,5 бр.', 'солпо вкус']);
    expect(writes).toBe(0);
  });

  it('порциите отвън (?servings=) заместват порциите на рецептата', async () => {
    setUpDevice('kiosk');
    serveRecipe();

    renderApp(`/recipes/${stew.id}/cook?servings=6`);

    expect(await screen.findByText('за 6 порции')).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Продукти' })).getByText('750 г'),
    ).toBeInTheDocument();
  });

  it('„Затвори“ излиза от Готвене от всяка стъпка, както „Готово“', async () => {
    const user = userEvent.setup();
    setUpDevice('kiosk');
    serveRecipe();

    const { router } = renderApp(`/recipes/${stew.id}/cook`);
    await user.click(await screen.findByRole('button', { name: 'Затвори' }));

    expect(
      await screen.findByRole('heading', { name: 'Пиле с ориз' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/recipes/${stew.id}`);
  });
  it('на тесен екран няма колона: „Продукти (N)“ отваря и затваря лист със същото съдържание', async () => {
    const user = userEvent.setup();
    stubNarrowScreen();
    setUpDevice('phone', dani.id);
    serveRecipe();

    renderApp(`/recipes/${stew.id}/cook`);

    expect(await screen.findByText('Стъпка 1 от 3')).toBeInTheDocument();
    expect(
      screen.queryByRole('list', { name: 'Продукти' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Прибери продуктите' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Продукти (3)' }));

    const sheet = screen.getByRole('dialog', { name: 'Продукти' });
    expect(
      within(within(sheet).getByRole('list', { name: 'Продукти' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['пилешко филе500 г', 'лук2 бр.', 'солпо вкус']);

    await user.click(
      within(sheet).getByRole('button', { name: 'Една порция повече' }),
    );
    expect(within(sheet).getByText('за 5 порции')).toBeInTheDocument();
    expect(within(sheet).getByText('625 г')).toBeInTheDocument();

    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Стъпка 1 от 3')).toBeInTheDocument();

    // Порциите остават на екрана: листът се отваря отново със същите.
    await user.click(screen.getByRole('button', { name: 'Продукти (3)' }));
    expect(
      within(screen.getByRole('dialog', { name: 'Продукти' })).getByText(
        'за 5 порции',
      ),
    ).toBeInTheDocument();
  });
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

/** Плъзгане с пръст по `element` от `fromX` до `toX`. */
function swipe(
  element: Element,
  fromX: number,
  toX: number,
  { fromY = 200, toY = 200 } = {},
) {
  fireEvent.touchStart(element, {
    touches: [{ clientX: fromX, clientY: fromY }],
    changedTouches: [{ clientX: fromX, clientY: fromY }],
  });
  fireEvent.touchEnd(element, {
    touches: [],
    changedTouches: [{ clientX: toX, clientY: toY }],
  });
}
