import { createBrowserHistory } from '@tanstack/react-router';
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { createQueryClient } from '../../app/query-client';
import { createAppRouter } from '../../app/router';
import {
  dinnerRecipes,
  lastWeek,
  nextWeek,
  pendingProposal,
  planFor,
  proposalId,
  scheduledProposal,
  serveDinnerRecipes,
  serveMealUpdates,
  servePlans,
  serveWeekProposal,
  showPastDays,
  thisWeek,
} from '../../test/menu';
import {
  apiError,
  dani,
  dashboardWith,
  fixtureNow,
  poli,
  server,
} from '../../test/msw';
import { renderApp, setUpDevice } from '../../test/render';

describe('MenuWeek', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(fixtureNow);
    setUpDevice('phone', dani.id);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('седмица без план предлага меню с подсказка или празен план', async () => {
    servePlans();

    renderApp('/menu');

    expect(
      await screen.findByRole('button', { name: 'Предложи меню' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Започни празно' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Подсказка' })).toHaveAttribute(
      'maxLength',
      '200',
    );
    expect(screen.getByRole('tab', { name: 'Тази седмица' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('404 без no_plan (напр. адрес, който api-то не познава) е грешка, а не седмица без план', async () => {
    server.use(
      http.get('/api/menu/plans', () =>
        HttpResponse.json(
          { error: 'not_found', message: 'Няма такъв адрес' },
          { status: 404 },
        ),
      ),
    );

    renderApp('/menu');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Няма такъв адрес',
    );
    expect(
      screen.queryByRole('button', { name: 'Започни празно' }),
    ).not.toBeInTheDocument();
  });

  it.each(['next', '2026-11-10'])(
    '?week=%s (не е понеделник) показва текущата седмица',
    async (week) => {
      servePlans();

      renderApp(`/menu?week=${week}`);

      expect(
        await screen.findByRole('tab', { name: 'Тази седмица' }),
      ).toHaveAttribute('aria-selected', 'true');
      expect(
        await screen.findByRole('button', { name: 'Предложи меню' }),
      ).toBeInTheDocument();
    },
  );

  it('?meal= (линкът от известие) отваря листа на ястието и превърта до реда; затварянето маха параметъра', async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => {});
    const plan = planFor(thisWeek, { 3: { note: 'мусака' } });
    servePlans({ [thisWeek]: plan });
    const thursday = plan.meals[3]?.id;

    const { router } = renderApp(`/menu?week=${thisWeek}&meal=${thursday}`);

    const sheet = await screen.findByRole('dialog', {
      name: 'четвъртък, 5 ноември',
    });
    const row = within(screen.getByRole('list', { name: 'Вечери' })).getByRole(
      'button',
      { name: /мусака/ },
    );
    expect(
      scrollIntoView.mock.contexts.some(
        (target) => target instanceof Element && target.contains(row),
      ),
    ).toBe(true);
    scrollIntoView.mockRestore();

    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(router.state.location.search).toEqual({ week: thisWeek });
  });

  describe('листът на ястието и „назад“', () => {
    let destroy = () => {};

    afterEach(async () => {
      destroy();
      destroy = () => {};
      cleanup();
      await waitFor(() =>
        expect(window.history.pushState).toBe(History.prototype.pushState),
      );
      window.history.replaceState(null, '', '/');
    });

    /** Приложението върху истинската история на прозореца: Дашборд, после `path`. */
    function renderInBrowser(path: string) {
      window.history.replaceState(null, '', '/');
      window.history.pushState(null, '', path);
      const history = createBrowserHistory();
      destroy = history.destroy;
      render(
        <App
          router={createAppRouter(history)}
          queryClient={createQueryClient({ retry: false })}
        />,
      );
    }

    async function back() {
      const popped = new Promise((resolve) =>
        window.addEventListener('popstate', resolve, { once: true }),
      );
      window.history.back();
      await popped;
    }

    it('затворен лист от адрес с week и meal: „назад“ не го отваря пак, а води на Дашборда', async () => {
      const user = userEvent.setup();
      vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(
        () => {},
      );
      const plan = planFor(thisWeek, { 3: { note: 'мусака' } });
      servePlans({ [thisWeek]: plan });
      renderInBrowser(`/menu?week=${thisWeek}&meal=${plan.meals[3]?.id}`);
      const sheet = await screen.findByRole('dialog', {
        name: 'четвъртък, 5 ноември',
      });

      await user.click(within(sheet).getByRole('button', { name: 'Готово' }));
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
      await back();

      await waitFor(() => expect(window.location.pathname).toBe('/'));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('лист, отворен с докосване: след „Готово“ „назад“ напуска менюто', async () => {
      const user = userEvent.setup();
      const plan = planFor(thisWeek, { 3: { note: 'мусака' } });
      servePlans({ [thisWeek]: plan });
      renderInBrowser('/menu');
      const row = await screen.findByRole('button', { name: /мусака/ });

      await user.click(row);
      const sheet = await screen.findByRole('dialog', {
        name: 'четвъртък, 5 ноември',
      });
      await user.click(within(sheet).getByRole('button', { name: 'Готово' }));
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
      await back();

      await waitFor(() => expect(window.location.pathname).toBe('/'));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('при < 7 вечерни рецепти казва колко още трябват и води към предложенията', async () => {
    const user = userEvent.setup();
    servePlans();
    const bodies: unknown[] = [];
    server.use(
      http.post('/api/menu/proposals', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(
          {
            error: 'conflict',
            code: 'not_enough_recipes',
            message: 'Трябват поне 7 рецепти за вечеря.',
            have: 4,
            need: 7,
          },
          { status: 409 },
        );
      }),
    );

    renderApp('/menu');
    await user.type(
      await screen.findByRole('textbox', { name: 'Подсказка' }),
      '  повече риба ',
    );
    await user.click(screen.getByRole('button', { name: 'Предложи меню' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Добавете още 3 рецепти',
    );
    expect(
      screen.getByRole('link', { name: 'Поискай предложения' }),
    ).toHaveAttribute('href', '/recipes/suggest');
    expect(bodies).toEqual([{ weekStart: '2026-11-02', hint: 'повече риба' }]);
  });

  it('план: седем вечери с ястие, готвач, порции и „защо“, под тях обобщението', async () => {
    const [chicken, lentils] = dinnerRecipes;
    servePlans({
      [thisWeek]: planFor(
        thisWeek,
        {
          0: {
            recipeId: chicken.id,
            recipe: { title: chicken.title, archivedAt: null, rating: null },
            cookUserId: poli.id,
            why: 'Бързо за понеделник.',
            servings: { [dani.id]: 2, [poli.id]: 1 },
          },
          1: {
            recipeId: lentils.id,
            recipe: {
              title: lentils.title,
              archivedAt: '2026-10-01T10:00:00.000Z',
              rating: null,
            },
          },
          4: { note: 'ядем навън', servings: { [dani.id]: 0, [poli.id]: 0 } },
        },
        { summary: 'Лека седмица с риба в петък.' },
      ),
    });

    renderApp('/menu');

    const meals = await screen.findByRole('list', { name: 'Вечери' });
    await showPastDays();
    const rows = within(meals).getAllByRole('listitem');
    expect(rows).toHaveLength(7);
    expect(rows[0]).toHaveTextContent('пн');
    expect(rows[0]).toHaveTextContent('пн 2.11');
    expect(rows[0]).toHaveTextContent('Пиле с ориз');
    expect(rows[0]).toHaveTextContent('Бързо за понеделник.');
    expect(rows[0]).toHaveTextContent('Готви Поли');
    expect(rows[0]).toHaveTextContent('3 порции');
    expect(rows[1]).toHaveTextContent('Леща чорба');
    expect(rows[1]).toHaveTextContent('архивирана');
    expect(rows[1]).toHaveTextContent('Без готвач');
    expect(rows[1]).toHaveTextContent('2 порции');
    expect(rows[4]).toHaveTextContent('ядем навън');
    expect(rows[4]).toHaveTextContent('0 порции');
    expect(rows[6]).toHaveTextContent('нд');
    expect(rows[6]).toHaveTextContent('Избери ястие');
    expect(
      screen.getByText('Лека седмица с риба в петък.'),
    ).toBeInTheDocument();
  });

  it('смяна на рецептата от листа праща PATCH само с recipeId и обновява реда', async () => {
    const user = userEvent.setup();
    const [chicken, lentils, moussaka, fish] = dinnerRecipes;
    // Четвъртък: от днес нататък (`fixtureNow` е сряда), рецептата още се сменя.
    const plan = planFor(thisWeek, {
      3: {
        recipeId: chicken.id,
        recipe: { title: chicken.title, archivedAt: null, rating: null },
        why: 'Бързо за четвъртък.',
      },
      2: {
        recipeId: moussaka.id,
        recipe: { title: moussaka.title, archivedAt: null, rating: null },
      },
    });
    servePlans({
      [thisWeek]: plan,
      [lastWeek]: planFor(lastWeek, {
        3: {
          recipeId: fish.id,
          recipe: { title: fish.title, archivedAt: null, rating: null },
        },
      }),
    });
    const queries = serveDinnerRecipes();
    const patches = serveMealUpdates(plan);

    renderApp('/menu');
    await screen.findByRole('list', { name: 'Вечери' });
    await showPastDays(user);
    await user.click(screen.getByRole('button', { name: /Пиле с ориз/ }));
    const sheet = screen.getByRole('dialog', { name: 'четвъртък, 5 ноември' });
    await user.click(within(sheet).getByRole('button', { name: 'Избери сам' }));
    expect(
      await within(sheet).findByRole('button', { name: /Мусака/ }),
    ).toHaveTextContent('в тази седмица');
    expect(
      await within(sheet).findByRole('button', { name: /Риба на фурна/ }),
    ).toHaveTextContent('последните 2 седмици');
    expect(queries[0]?.get('tag')).toBe('dinner');

    await user.type(
      within(sheet).getByRole('searchbox', { name: 'Търси рецепта' }),
      'леща',
    );
    await expect.poll(() => queries.at(-1)?.get('q')).toBe('леща');
    await user.click(
      await within(sheet).findByRole('button', { name: lentils.title }),
    );

    await expect
      .poll(() => patches)
      .toEqual([{ id: plan.meals[3]?.id, body: { recipeId: lentils.id } }]);
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));
    const row = screen.getByRole('button', { name: /Леща чорба/ });
    expect(row).toHaveTextContent('чт');
    expect(row).not.toHaveTextContent('Бързо за четвъртък.');
  });

  it('листът на ден с рецепта води към рецептата; празен ден — не', async () => {
    const user = userEvent.setup();
    const [chicken] = dinnerRecipes;
    servePlans({
      [thisWeek]: planFor(thisWeek, {
        0: {
          recipeId: chicken.id,
          recipe: { title: chicken.title, archivedAt: null, rating: null },
        },
      }),
    });
    serveDinnerRecipes();

    renderApp('/menu');
    await screen.findByRole('list', { name: 'Вечери' });
    await showPastDays(user);
    await user.click(screen.getByRole('button', { name: /Пиле с ориз/ }));
    expect(
      within(
        screen.getByRole('dialog', { name: 'понеделник, 2 ноември' }),
      ).getByRole('link', { name: 'Към рецептата' }),
    ).toHaveAttribute('href', `/recipes/${chicken.id}`);
    await user.click(screen.getByRole('button', { name: 'Готово' }));

    await user.click(screen.getByRole('button', { name: /вт/ }));
    expect(
      within(
        screen.getByRole('dialog', { name: 'вторник, 3 ноември' }),
      ).queryByRole('link', { name: 'Към рецептата' }),
    ).not.toBeInTheDocument();
  });

  it('промяна на днешното ястие се вижда веднага в „Днес се готви“', async () => {
    const user = userEvent.setup();
    // Сряда, 4 ноември (`fixtureNow`) е третият ден от седмицата.
    const plan = planFor(thisWeek, { 2: { note: 'остатъци' } });
    servePlans({ [thisWeek]: plan });
    serveDinnerRecipes();
    serveMealUpdates(plan);
    server.use(
      http.get('/api/dashboard', () => {
        const today = plan.meals[2];
        return HttpResponse.json(
          dashboardWith({
            cooking: {
              lunch: null,
              dinner: today?.note
                ? { title: today.note, cookUserId: null }
                : null,
            },
          }),
        );
      }),
    );

    renderApp('/');
    expect(await screen.findByText('остатъци')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Меню' }));
    await user.click(await screen.findByRole('button', { name: /остатъци/ }));
    const sheet = screen.getByRole('dialog', { name: 'сряда, 4 ноември' });
    const note = within(sheet).getByRole('textbox', { name: 'Бележка' });
    await user.clear(note);
    await user.type(note, 'ядем навън');
    await user.click(within(sheet).getByRole('button', { name: 'Запази' }));
    await expect.poll(() => plan.meals[2]?.note).toBe('ядем навън');
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));
    await user.click(screen.getByRole('link', { name: 'Дашборд' }));

    expect(await screen.findByText('ядем навън')).toBeInTheDocument();
  });

  it('готвач, порции и бележка са отделни PATCH-ове', async () => {
    const user = userEvent.setup();
    const plan = planFor(thisWeek);
    servePlans({ [thisWeek]: plan });
    serveDinnerRecipes();
    const patches = serveMealUpdates(plan);
    // Четвъртък: от днес нататък, бележката още се сменя.
    const thursday = plan.meals[3]?.id;

    renderApp('/menu');
    // Минал ден е „—“, затова празните редове „Избери ястие“ са от сряда нататък.
    const rows = await screen.findAllByRole('button', { name: /Избери ястие/ });
    await user.click(rows[1] as HTMLElement);
    const sheet = screen.getByRole('dialog', { name: 'четвъртък, 5 ноември' });

    await user.click(within(sheet).getByRole('button', { name: 'Поли' }));
    await expect
      .poll(
        () => within(sheet).getByRole('button', { name: 'Поли' }).ariaPressed,
      )
      .toBe('true');
    await user.click(
      within(sheet).getByRole('button', { name: 'Повече порции за Дани' }),
    );
    await expect
      .poll(
        () =>
          within(sheet).getByRole('status', { name: 'Порции за Дани' })
            .textContent,
      )
      .toBe('2');
    await user.click(
      within(sheet).getByRole('button', { name: 'По-малко порции за Поли' }),
    );
    await expect
      .poll(() =>
        within(sheet)
          .getByRole('button', { name: 'По-малко порции за Поли' })
          .hasAttribute('disabled'),
      )
      .toBe(true);
    await user.type(
      within(sheet).getByRole('textbox', { name: 'Бележка' }),
      'ядем навън',
    );
    await user.click(within(sheet).getByRole('button', { name: 'Запази' }));
    await user.click(within(sheet).getByRole('button', { name: 'никой' }));

    await expect.poll(() => patches.length).toBe(5);
    expect(patches).toEqual([
      { id: thursday, body: { cookUserId: poli.id } },
      { id: thursday, body: { servings: { [dani.id]: 2, [poli.id]: 1 } } },
      { id: thursday, body: { servings: { [dani.id]: 2, [poli.id]: 0 } } },
      { id: thursday, body: { note: 'ядем навън' } },
      { id: thursday, body: { cookUserId: null } },
    ]);
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));
    expect(
      screen.getByRole('button', { name: /ядем навън/ }),
    ).toHaveTextContent('2 порции');
  });

  it('минала седмица е само за четене: редът отваря листа за четене, без предложение и изтриване', async () => {
    const user = userEvent.setup();
    const asked = servePlans({ [lastWeek]: planFor(lastWeek) });

    renderApp('/menu');
    await screen.findByRole('button', { name: 'Предложи меню' });
    await user.click(screen.getByRole('button', { name: 'Предишна седмица' }));

    const meals = await screen.findByRole('list', { name: 'Вечери' });
    expect(within(meals).getAllByRole('listitem')).toHaveLength(7);
    expect(within(meals).queryByRole('button', { name: 'Да' })).toBeNull();
    expect(meals).not.toHaveTextContent('Избери ястие');
    await user.click(within(meals).getAllByRole('button')[0] as HTMLElement);
    const sheet = screen.getByRole('dialog', {
      name: 'понеделник, 26 октомври',
    });
    expect(sheet).toHaveTextContent(
      'Седмицата е минала: менюто се чете, но не се сменя.',
    );
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));
    expect(
      screen.queryByRole('button', { name: 'Изтрий плана' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('минала седмица')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Предишна седмица' }));
    expect(
      await screen.findByText('Няма меню за тази седмица.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Предложи меню' }),
    ).not.toBeInTheDocument();
    expect(asked).toEqual([thisWeek, lastWeek, '2026-10-19']);
  });

  it('„Започни празно“ създава план за следващата седмица', async () => {
    const user = userEvent.setup();
    servePlans();
    const bodies: unknown[] = [];
    server.use(
      http.post('/api/menu/plans', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ plan: planFor(nextWeek) }, { status: 201 });
      }),
    );

    renderApp('/menu');
    await user.click(
      await screen.findByRole('tab', { name: 'Следваща седмица' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Започни празно' }),
    );

    expect(
      await screen.findAllByRole('button', { name: /Избери ястие/ }),
    ).toHaveLength(7);
    expect(bodies).toEqual([{ weekStart: nextWeek }]);
  });

  it('„Изтрий плана“ иска потвърждение, само преди седмицата да е започнала', async () => {
    const user = userEvent.setup();
    servePlans({
      [thisWeek]: planFor(thisWeek),
      [nextWeek]: planFor(nextWeek),
    });
    const deleted: string[] = [];
    server.use(
      http.delete('/api/menu/plans/:id', ({ params }) => {
        deleted.push(String(params.id));
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderApp('/menu');
    await screen.findByRole('list', { name: 'Вечери' });
    expect(
      screen.queryByRole('button', { name: 'Изтрий плана' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Следваща седмица' }));
    await user.click(
      await screen.findByRole('button', { name: 'Изтрий плана' }),
    );
    expect(deleted).toEqual([]);
    expect(
      screen.getByRole('alertdialog', { name: 'Изтриване' }),
    ).toHaveTextContent('Гласовете и разговорите се трият заедно с менюто.');
    await user.click(screen.getByRole('button', { name: 'Изтрий' }));

    expect(
      await screen.findByRole('button', { name: 'Предложи меню' }),
    ).toBeInTheDocument();
    expect(deleted).toEqual([planFor(nextWeek).id]);
  });
});

describe('MenuWeek на kiosk', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(fixtureNow);
    setUpDevice('kiosk');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('без действащ потребител менюто е само за четене, с „Назад“ към дашборда', async () => {
    const actingUsers: (string | null)[] = [];
    server.use(
      http.get('/api/menu/plans', ({ request }) => {
        actingUsers.push(request.headers.get('x-acting-user'));
        return HttpResponse.json({ plan: planFor(thisWeek) });
      }),
    );

    renderApp('/menu');

    const meals = await screen.findByRole('list', { name: 'Вечери' });
    expect(within(meals).getAllByRole('listitem')).toHaveLength(7);
    expect(within(meals).queryByRole('button')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Изтрий плана' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Назад' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(actingUsers).toEqual([null]);
  });

  it('седмица без план не предлага меню', async () => {
    servePlans();

    renderApp('/menu');

    expect(
      await screen.findByText('Няма меню за тази седмица.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Предложи меню' }),
    ).not.toBeInTheDocument();
  });
});

describe('MenuWeek: предложение', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(fixtureNow);
    setUpDevice('phone', dani.id);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** `GET /api/menu/proposals/:id` с поредните състояния; последното се повтаря. */
  function serveProposal(...states: (typeof pendingProposal)[]) {
    let calls = 0;
    server.use(
      http.post('/api/menu/proposals', () =>
        HttpResponse.json({ proposal: pendingProposal }, { status: 202 }),
      ),
      http.get(`/api/menu/proposals/${proposalId}`, () => {
        const proposal = states[Math.min(calls, states.length - 1)];
        calls += 1;
        return HttpResponse.json({ proposal });
      }),
    );
    return () => calls;
  }

  it('докато е pending пита на 3 s; при done показва плана', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const plans: Record<string, ReturnType<typeof planFor>> = {};
    servePlans(plans);
    const calls = serveProposal(pendingProposal, {
      ...pendingProposal,
      status: 'done',
      planId: planFor(thisWeek).id,
      finishedAt: '2026-11-04T08:01:00.000Z',
    });

    renderApp('/menu');
    await user.click(
      await screen.findByRole('button', { name: 'Предложи меню' }),
    );
    expect(await screen.findByText('Съставям меню…')).toBeInTheDocument();
    const before = calls();

    plans[thisWeek] = planFor(thisWeek, {}, { summary: 'Седмица без месо.' });
    await act(() => vi.advanceTimersByTimeAsync(3000));

    expect(await screen.findByText('Седмица без месо.')).toBeInTheDocument();
    expect(calls()).toBe(before + 1);
    expect(screen.queryByText('Съставям меню…')).not.toBeInTheDocument();
  });

  it('при failed показва грешката и „Опитай пак“ със същата подсказка', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    servePlans();
    serveProposal({
      ...pendingProposal,
      status: 'failed',
      error: 'timeout',
      finishedAt: '2026-11-04T08:03:00.000Z',
    });

    renderApp(`/menu?proposal=${proposalId}`);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'AI не отговори за 3 минути. Опитай пак или започни празно.',
    );
    expect(screen.getByRole('textbox', { name: 'Подсказка' })).toHaveValue(
      'повече риба',
    );
    await user.click(screen.getByRole('button', { name: 'Опитай пак' }));
    expect(await screen.findByText('Съставям меню…')).toBeInTheDocument();
  });
});

describe('MenuWeek: чакащото предложение на седмицата', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(fixtureNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('предложение, поискано от другия, се вижда като „Дани съставя меню…“ с изключени подсказка и бутони', async () => {
    setUpDevice('phone', poli.id);
    servePlans();
    serveWeekProposal(pendingProposal);

    renderApp('/menu');

    expect(await screen.findByText('Дани съставя меню…')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Предложи меню' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Започни празно' }),
    ).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Подсказка' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Подсказка' })).toHaveValue(
      'повече риба',
    );
  });

  it('своето предложение се намира и без ?proposal= (след връщане в „Меню“); при done показва плана', async () => {
    setUpDevice('phone', dani.id);
    const plans: Record<string, ReturnType<typeof planFor>> = {};
    servePlans(plans);
    serveWeekProposal(pendingProposal, {
      ...pendingProposal,
      status: 'done',
      planId: planFor(thisWeek).id,
      finishedAt: '2026-11-04T08:01:00.000Z',
    });

    renderApp('/menu');

    expect(await screen.findByText('Съставям меню…')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Предложи меню' }),
    ).toBeDisabled();
    plans[thisWeek] = planFor(thisWeek, {}, { summary: 'Седмица без месо.' });
    await act(() => vi.advanceTimersByTimeAsync(3000));

    expect(await screen.findByText('Седмица без месо.')).toBeInTheDocument();
    expect(screen.queryByText('Съставям меню…')).not.toBeInTheDocument();
  });

  it('чакащото предложение, което се провали, оставя подсказката си в полето за „Опитай пак“', async () => {
    setUpDevice('phone', poli.id);
    servePlans();
    serveWeekProposal(pendingProposal, {
      ...pendingProposal,
      status: 'failed',
      error: 'timeout',
      finishedAt: '2026-11-04T08:03:00.000Z',
    });

    renderApp('/menu');
    expect(await screen.findByText('Дани съставя меню…')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(3000));

    expect(
      await screen.findByRole('button', { name: 'Опитай пак' }),
    ).toBeEnabled();
    expect(screen.getByRole('textbox', { name: 'Подсказка' })).toHaveValue(
      'повече риба',
    );
  });

  it('неуспешното предложение в адреса не скрива по-новото чуждо: след презареждане се вижда чакането', async () => {
    setUpDevice('phone', dani.id);
    servePlans();
    server.use(
      http.get(`/api/menu/proposals/${proposalId}`, () =>
        HttpResponse.json({
          proposal: {
            ...pendingProposal,
            status: 'failed',
            error: 'http_500',
            finishedAt: '2026-11-04T08:00:05.000Z',
          },
        }),
      ),
    );
    serveWeekProposal({
      ...pendingProposal,
      id: 'ffffffff-0000-4000-8000-0000000000a1',
      requestedBy: poli.id,
      createdAt: '2026-11-04T08:01:00.000Z',
    });

    renderApp(`/menu?proposal=${proposalId}`);

    expect(await screen.findByText('Поли съставя меню…')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Предложи меню' }),
    ).toBeDisabled();
  });

  it('„Опитай пак“, докато другият вече иска меню (409), показва неговото чакане вместо отказа', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    setUpDevice('phone', dani.id);
    servePlans();
    serveWeekProposal(
      {
        ...pendingProposal,
        status: 'failed',
        error: 'http_500',
        finishedAt: '2026-11-04T08:00:05.000Z',
      },
      {
        ...pendingProposal,
        id: 'ffffffff-0000-4000-8000-0000000000a1',
        requestedBy: poli.id,
        createdAt: '2026-11-04T08:01:00.000Z',
      },
    );
    server.use(
      http.post('/api/menu/proposals', () =>
        apiError(409, 'conflict', 'За седмицата вече се подготвя предложение'),
      ),
    );

    renderApp('/menu');
    await user.click(await screen.findByRole('button', { name: 'Опитай пак' }));

    expect(await screen.findByText('Поли съставя меню…')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('при failed без ?proposal= показва грешката и „Опитай пак“ с подсказката на заявката', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    setUpDevice('phone', poli.id);
    servePlans();
    serveWeekProposal({
      ...pendingProposal,
      status: 'failed',
      error: 'timeout',
      finishedAt: '2026-11-04T08:03:00.000Z',
    });
    const bodies: unknown[] = [];
    server.use(
      http.post('/api/menu/proposals', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(
          { proposal: { ...pendingProposal, requestedBy: poli.id } },
          { status: 202 },
        );
      }),
    );

    renderApp('/menu');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'AI не отговори за 3 минути. Опитай пак или започни празно.',
    );
    expect(screen.getByRole('textbox', { name: 'Подсказка' })).toHaveValue(
      'повече риба',
    );
    await user.click(screen.getByRole('button', { name: 'Опитай пак' }));
    expect(bodies).toEqual([{ weekStart: thisWeek, hint: 'повече риба' }]);
  });
});

describe('MenuWeek: кой е предложил менюто', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(fixtureNow);
    setUpDevice('phone', poli.id);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const plan = planFor(thisWeek, {}, { summary: 'Седмица с риба.' });

  it('над седмицата е „Предложено от Дани“ с подсказката на предложението', async () => {
    servePlans({ [thisWeek]: plan });
    serveWeekProposal({
      ...pendingProposal,
      status: 'done',
      planId: plan.id,
      finishedAt: '2026-11-04T08:01:00.000Z',
    });

    renderApp('/menu');

    expect(
      await screen.findByText('Предложено от Дани · „повече риба“'),
    ).toBeInTheDocument();
  });

  it('без подсказка е само „Предложено от Дани“', async () => {
    servePlans({ [thisWeek]: plan });
    const { hint: _, ...withoutHint } = pendingProposal;
    serveWeekProposal({
      ...withoutHint,
      status: 'done',
      planId: plan.id,
      finishedAt: '2026-11-04T08:01:00.000Z',
    });

    renderApp('/menu');

    expect(await screen.findByText('Предложено от Дани')).toBeInTheDocument();
  });

  it('план, който не е от последното предложение (напр. „Започни празно“ след изтрит), е без реда', async () => {
    servePlans({ [thisWeek]: plan });
    serveWeekProposal({
      ...pendingProposal,
      status: 'done',
      planId: 'ffffffff-0000-4000-8000-0000000000aa',
      finishedAt: '2026-11-04T08:01:00.000Z',
    });

    renderApp('/menu');

    expect(await screen.findByText('Седмица с риба.')).toBeInTheDocument();
    expect(screen.queryByText(/Предложено от/)).not.toBeInTheDocument();
  });
});

describe('MenuWeek: предложение от крона в сряда', () => {
  const AUTO = 'Предложено автоматично в сряда';

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(fixtureNow);
    setUpDevice('phone', dani.id);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('планът, предложен от крона, е „автоматично“; планът на човек — не', async () => {
    servePlans({
      [thisWeek]: planFor(thisWeek, {}, { summary: 'Нашето меню.' }),
      [nextWeek]: planFor(nextWeek, {}, { createdBy: null }),
    });

    renderApp(`/menu?week=${nextWeek}`);

    expect(await screen.findByText(AUTO)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Тази седмица' }));
    expect(await screen.findByText('Нашето меню.')).toBeInTheDocument();
    expect(screen.queryByText(AUTO)).not.toBeInTheDocument();
  });

  it('докато кронът съставя менюто, седмицата чака; при done показва плана', async () => {
    const plans: Record<string, ReturnType<typeof planFor>> = {};
    servePlans(plans);
    serveWeekProposal(scheduledProposal, {
      ...scheduledProposal,
      status: 'done',
      planId: planFor(nextWeek).id,
      finishedAt: '2026-11-04T07:01:00.000Z',
    });

    renderApp(`/menu?week=${nextWeek}`);

    expect(
      await screen.findByText('Съставям меню автоматично…'),
    ).toBeInTheDocument();
    expect(screen.getByText(AUTO)).toBeInTheDocument();
    plans[nextWeek] = planFor(
      nextWeek,
      {},
      { createdBy: null, summary: 'Седмица с риба.' },
    );
    await act(() => vi.advanceTimersByTimeAsync(3000));

    expect(await screen.findByText('Седмица с риба.')).toBeInTheDocument();
  });

  it('при неуспех на крона показва причината и „Предложи меню“', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    servePlans();
    serveWeekProposal({
      ...scheduledProposal,
      status: 'failed',
      error: 'timeout',
      finishedAt: '2026-11-04T07:03:00.000Z',
    });
    const bodies: unknown[] = [];
    server.use(
      http.post('/api/menu/proposals', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(
          { proposal: { ...pendingProposal, weekStart: nextWeek } },
          { status: 202 },
        );
      }),
    );

    renderApp(`/menu?week=${nextWeek}`);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'AI не отговори за 3 минути. Опитай пак или започни празно.',
    );
    expect(screen.getByText(AUTO)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Предложи меню' }));
    expect(bodies).toEqual([{ weekStart: nextWeek }]);
  });
});
