import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dinnerRecipes,
  lastWeek,
  nextWeek,
  pendingProposal,
  planFor,
  proposalId,
  serveDinnerRecipes,
  serveMealUpdates,
  servePlans,
  thisWeek,
} from '../../test/menu';
import { dani, fixtureNow, poli, server } from '../../test/msw';
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
            recipe: { title: chicken.title, archivedAt: null },
            cookUserId: poli.id,
            why: 'Бързо за понеделник.',
            servings: { [dani.id]: 2, [poli.id]: 1 },
          },
          1: {
            recipeId: lentils.id,
            recipe: {
              title: lentils.title,
              archivedAt: '2026-10-01T10:00:00.000Z',
            },
          },
          4: { note: 'ядем навън', servings: { [dani.id]: 0, [poli.id]: 0 } },
        },
        { summary: 'Лека седмица с риба в петък.' },
      ),
    });

    renderApp('/menu');

    const meals = await screen.findByRole('list', { name: 'Вечери' });
    const rows = within(meals).getAllByRole('listitem');
    expect(rows).toHaveLength(7);
    expect(rows[0]).toHaveTextContent('пн');
    expect(rows[0]).toHaveTextContent('2 ноември');
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
    const plan = planFor(thisWeek, {
      0: {
        recipeId: chicken.id,
        recipe: { title: chicken.title, archivedAt: null },
        why: 'Бързо за понеделник.',
      },
      2: {
        recipeId: moussaka.id,
        recipe: { title: moussaka.title, archivedAt: null },
      },
    });
    servePlans({
      [thisWeek]: plan,
      [lastWeek]: planFor(lastWeek, {
        3: {
          recipeId: fish.id,
          recipe: { title: fish.title, archivedAt: null },
        },
      }),
    });
    const queries = serveDinnerRecipes();
    const patches = serveMealUpdates(plan);

    renderApp('/menu');
    await user.click(
      await screen.findByRole('button', { name: /Пиле с ориз/ }),
    );
    const sheet = screen.getByRole('dialog', { name: 'понеделник, 2 ноември' });
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
      .toEqual([{ id: plan.meals[0]?.id, body: { recipeId: lentils.id } }]);
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));
    const row = screen.getByRole('button', { name: /Леща чорба/ });
    expect(row).toHaveTextContent('пн');
    expect(row).not.toHaveTextContent('Бързо за понеделник.');
  });

  it('готвач, порции и бележка са отделни PATCH-ове', async () => {
    const user = userEvent.setup();
    const plan = planFor(thisWeek);
    servePlans({ [thisWeek]: plan });
    serveDinnerRecipes();
    const patches = serveMealUpdates(plan);
    const tuesday = plan.meals[1]?.id;

    renderApp('/menu');
    const rows = await screen.findAllByRole('button', { name: /Избери ястие/ });
    await user.click(rows[1] as HTMLElement);
    const sheet = screen.getByRole('dialog', { name: 'вторник, 3 ноември' });

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
      { id: tuesday, body: { cookUserId: poli.id } },
      { id: tuesday, body: { servings: { [dani.id]: 2, [poli.id]: 1 } } },
      { id: tuesday, body: { servings: { [dani.id]: 2, [poli.id]: 0 } } },
      { id: tuesday, body: { note: 'ядем навън' } },
      { id: tuesday, body: { cookUserId: null } },
    ]);
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));
    expect(
      screen.getByRole('button', { name: /ядем навън/ }),
    ).toHaveTextContent('2 порции');
  });

  it('минала седмица е само за четене: без редакция, предложение и изтриване', async () => {
    const user = userEvent.setup();
    const asked = servePlans({ [lastWeek]: planFor(lastWeek) });

    renderApp('/menu');
    await screen.findByRole('button', { name: 'Предложи меню' });
    await user.click(screen.getByRole('button', { name: 'Предишна седмица' }));

    const meals = await screen.findByRole('list', { name: 'Вечери' });
    expect(within(meals).getAllByRole('listitem')).toHaveLength(7);
    expect(within(meals).queryByRole('button')).not.toBeInTheDocument();
    expect(meals).not.toHaveTextContent('Избери ястие');
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
      'Не успях навреме, опитай пак',
    );
    expect(screen.getByRole('textbox', { name: 'Подсказка' })).toHaveValue(
      'повече риба',
    );
    await user.click(screen.getByRole('button', { name: 'Опитай пак' }));
    expect(await screen.findByText('Съставям меню…')).toBeInTheDocument();
  });
});
