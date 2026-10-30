import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { dani, server } from '../../test/msw';
import { chickenWithRice, omelette, toSummary } from '../../test/recipes';
import { renderApp, setUpDevice } from '../../test/render';

/** Записва query-тата на `GET /api/recipes` и връща дадените рецепти. */
function serveRecipes(recipes = [chickenWithRice, omelette]) {
  const queries: URLSearchParams[] = [];
  server.use(
    http.get('/api/recipes', ({ request }) => {
      queries.push(new URL(request.url).searchParams);
      return HttpResponse.json({ recipes: recipes.map(toSummary) });
    }),
  );
  return queries;
}

describe('RecipeList', () => {
  it('е основен екран: заглавие без „← Начало“', async () => {
    setUpDevice('phone', dani.id);
    serveRecipes();

    renderApp('/recipes');

    expect(
      await screen.findByRole('heading', { name: 'Рецепти' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Начало/ })).toBeNull();
  });

  it('показва рецептите от регистъра с време и тагове', async () => {
    setUpDevice('phone', dani.id);
    serveRecipes();

    renderApp('/recipes');

    const card = await screen.findByRole('link', { name: /Пиле с ориз/ });
    expect(card).toHaveTextContent('45 мин');
    expect(card).toHaveTextContent('подходящо за дете');
    expect(card).toHaveAttribute('href', `/recipes/${chickenWithRice.id}`);
    expect(screen.getByRole('link', { name: /Омлет/ })).toBeInTheDocument();
  });

  it('„Филтри“ отваря лист с групите; изборът брои в „Филтри (N)“ и филтрира веднага', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const queries = serveRecipes();

    renderApp('/recipes');
    await screen.findByRole('link', { name: /Омлет/ });
    expect(screen.queryByRole('group', { name: 'Етикет' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Филтри' }));

    const sheet = screen.getByRole('dialog', { name: 'Филтри' });
    for (const group of ['Етикет', 'Време', 'Подреди']) {
      expect(
        within(sheet).getByRole('group', { name: group }),
      ).toBeInTheDocument();
    }
    await user.click(within(sheet).getByRole('button', { name: 'закуска' }));
    await expect.poll(() => queries.at(-1)?.get('tag')).toBe('breakfast');
    await user.click(within(sheet).getByRole('button', { name: 'до 15 мин' }));
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    expect(
      screen.getByRole('button', { name: 'Филтри (2)' }),
    ).toBeInTheDocument();
  });

  it('няколко тага и интервала за време влизат в query-то; второ натискане маха избора', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const queries = serveRecipes();

    renderApp('/recipes');
    await screen.findByRole('link', { name: /Омлет/ });
    await user.click(screen.getByRole('button', { name: 'Филтри' }));
    for (const name of [
      'обяд',
      'вечеря',
      'подходящо за дете',
      'до 15 мин',
      '30–45 мин',
      'над 60 мин',
    ]) {
      await user.click(screen.getByRole('button', { name }));
    }
    await user.click(screen.getByRole('button', { name: 'над 60 мин' }));

    await expect
      .poll(() => queries.at(-1)?.getAll('tag'))
      .toEqual(['lunch', 'dinner', 'kid_friendly']);
    expect(queries.at(-1)?.getAll('time')).toEqual(['0-15', '30-45']);
    expect(screen.getByRole('button', { name: 'над 60 мин' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('„Изчисти“ се появява при избор и маха филтрите — в листа и над списъка', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const queries = serveRecipes();

    renderApp('/recipes');
    await screen.findByRole('link', { name: /Омлет/ });
    expect(screen.queryByRole('button', { name: 'Изчисти' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Филтри' }));
    const sheet = screen.getByRole('dialog', { name: 'Филтри' });
    expect(within(sheet).queryByRole('button', { name: 'Изчисти' })).toBeNull();

    await user.click(within(sheet).getByRole('button', { name: 'вечеря' }));
    await user.click(within(sheet).getByRole('button', { name: 'Изчисти' }));
    expect(
      within(sheet).getByRole('button', { name: 'вечеря' }),
    ).toHaveAttribute('aria-pressed', 'false');
    await user.click(within(sheet).getByRole('button', { name: 'над 60 мин' }));
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));
    await expect.poll(() => queries.at(-1)?.get('time')).toBe('60+');

    await user.click(screen.getByRole('button', { name: 'Изчисти' }));
    expect(screen.getByRole('button', { name: 'Филтри' })).toBeInTheDocument();
    await expect.poll(() => queries.at(-1)?.has('time')).toBe(false);
  });

  it('филтрите и подреждането остават след връщане от рецепта', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const queries = serveRecipes();
    server.use(
      http.get(`/api/recipes/${omelette.id}`, () =>
        HttpResponse.json({ recipe: omelette }),
      ),
    );

    renderApp('/recipes');
    await screen.findByRole('link', { name: /Омлет/ });
    await user.click(screen.getByRole('button', { name: 'Филтри' }));
    await user.click(screen.getByRole('button', { name: 'закуска' }));
    await user.click(screen.getByRole('radio', { name: 'по оценка' }));
    await user.click(screen.getByRole('button', { name: 'Готово' }));
    await user.click(await screen.findByRole('link', { name: /Омлет/ }));
    await screen.findByRole('heading', { name: omelette.title });
    const before = queries.length;
    await user.click(screen.getByRole('link', { name: '← Рецепти' }));

    expect(
      await screen.findByRole('button', { name: 'Филтри (1)' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Филтри (1)' }));
    expect(screen.getByRole('button', { name: 'закуска' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('radio', { name: 'по оценка' })).toBeChecked();
    // Списъкът се презарежда със същите филтри, не без тях.
    for (const query of queries.slice(before)) {
      expect(query.get('sort')).toBe('rating');
      if (!query.has('includeArchived')) {
        expect(query.get('tag')).toBe('breakfast');
      }
    }
  });

  it('над списъка е броят: „2 рецепти“ без филтри, „1 от 2“ при търсене или филтър', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    server.use(
      http.get('/api/recipes', ({ request }) => {
        const params = new URL(request.url).searchParams;
        const narrowed = params.has('q') || params.has('tag');
        const recipes = narrowed ? [omelette] : [chickenWithRice, omelette];
        return HttpResponse.json({ recipes: recipes.map(toSummary) });
      }),
    );

    renderApp('/recipes');
    expect(await screen.findByText('2 рецепти')).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: 'Търси' }), 'омлет');
    expect(await screen.findByText('1 от 2')).toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox', { name: 'Търси' }));
    expect(await screen.findByText('2 рецепти')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Филтри' }));
    await user.click(screen.getByRole('button', { name: 'закуска' }));
    expect(await screen.findByText('1 от 2')).toBeInTheDocument();
  });

  it('търсенето праща q, а „покажи архивираните“ праща includeArchived', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const queries = serveRecipes();

    renderApp('/recipes');
    await screen.findByRole('link', { name: /Омлет/ });
    await user.type(screen.getByRole('searchbox', { name: 'Търси' }), 'пиле');
    await expect.poll(() => queries.at(-1)?.get('q')).toBe('пиле');
    await user.click(screen.getByRole('button', { name: 'Филтри' }));
    await user.click(
      screen.getByRole('checkbox', { name: 'Покажи архивираните' }),
    );
    await expect
      .poll(() => queries.at(-1)?.get('includeArchived'))
      .toBe('true');
  });

  it('оценената рецепта показва звездите до заглавието, неоценената — нищо', async () => {
    setUpDevice('phone', dani.id);
    serveRecipes([{ ...chickenWithRice, rating: 4 }, omelette]);

    renderApp('/recipes');

    const card = await screen.findByRole('link', { name: /Пиле с ориз/ });
    expect(
      within(card).getByRole('img', { name: 'Оценка 4 от 5' }),
    ).toHaveTextContent('★★★★☆');
    expect(
      within(screen.getByRole('link', { name: /Омлет/ })).queryByRole('img'),
    ).toBeNull();
  });

  it('„по оценка“ праща sort=rating, „по име“ го маха', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const queries = serveRecipes();

    renderApp('/recipes');
    await screen.findByRole('link', { name: /Омлет/ });
    await user.click(screen.getByRole('button', { name: 'Филтри' }));
    const sort = screen.getByRole('group', { name: 'Подреди' });
    expect(within(sort).getByRole('radio', { name: 'по име' })).toBeChecked();

    await user.click(within(sort).getByRole('radio', { name: 'по оценка' }));
    await expect.poll(() => queries.at(-1)?.get('sort')).toBe('rating');

    await user.click(within(sort).getByRole('radio', { name: 'по име' }));
    await expect.poll(() => queries.at(-1)?.has('sort')).toBe(false);
  });

  it('празен регистър: без търсене и „Филтри“, празното състояние е горе с бутоните', async () => {
    setUpDevice('phone', dani.id);
    serveRecipes([]);

    renderApp('/recipes');

    const empty = await screen.findByText(
      'Няма рецепти. Добави първата или поискай предложения.',
    );
    expect(screen.queryByRole('searchbox', { name: 'Търси' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Филтри/ })).toBeNull();
    expect(screen.queryByText(/рецепти$/)).toBeNull();
    const box = empty.parentElement as HTMLElement;
    expect(
      within(box).getByRole('link', { name: 'Добави рецепта' }),
    ).toHaveAttribute('href', '/recipes/new');
    expect(
      within(box).getByRole('link', { name: 'Поискай предложения' }),
    ).toHaveAttribute('href', '/recipes/suggest');
    expect(screen.getByRole('link', { name: 'Нова рецепта' })).toHaveAttribute(
      'href',
      '/recipes/new',
    );
  });

  it('само архивирани рецепти: „Филтри“ остава и „Покажи архивираните“ ги показва', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const archived = { ...omelette, archivedAt: '2026-10-01T00:00:00.000Z' };
    server.use(
      http.get('/api/recipes', ({ request }) => {
        const params = new URL(request.url).searchParams;
        const recipes = params.has('includeArchived') ? [archived] : [];
        return HttpResponse.json({ recipes: recipes.map(toSummary) });
      }),
    );

    renderApp('/recipes');
    expect(
      await screen.findByText('Няма рецепти по този избор.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Филтри' }));
    await user.click(
      screen.getByRole('checkbox', { name: 'Покажи архивираните' }),
    );
    await user.click(screen.getByRole('button', { name: 'Готово' }));

    const card = await screen.findByRole('link', { name: /Омлет/ });
    expect(card).toHaveTextContent('архивирана');
    expect(
      screen.queryByText(
        'Няма рецепти. Добави първата или поискай предложения.',
      ),
    ).toBeNull();
  });

  it('филтър без резултати оставя търсенето и „Изчисти“, с „0 от 2“', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    server.use(
      http.get('/api/recipes', ({ request }) => {
        const narrowed = new URL(request.url).searchParams.has('time');
        const recipes = narrowed ? [] : [chickenWithRice, omelette];
        return HttpResponse.json({ recipes: recipes.map(toSummary) });
      }),
    );

    renderApp('/recipes');
    await screen.findByRole('link', { name: /Омлет/ });
    await user.click(screen.getByRole('button', { name: 'Филтри' }));
    await user.click(screen.getByRole('button', { name: 'над 60 мин' }));
    await user.click(screen.getByRole('button', { name: 'Готово' }));

    expect(await screen.findByText('0 от 2')).toBeInTheDocument();
    expect(screen.getByText('Няма рецепти по този избор.')).toBeInTheDocument();
    expect(
      screen.getByRole('searchbox', { name: 'Търси' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Изчисти' })).toBeInTheDocument();
  });

  it.each(['phone', 'browser'] as const)(
    'на %s регистърът предлага „Нова“, „Внеси“ и „Поискай предложения“',
    async (mode) => {
      setUpDevice(mode, dani.id);
      serveRecipes();

      renderApp('/recipes');

      await screen.findByRole('link', { name: /Омлет/ });
      expect(screen.getByRole('link', { name: 'Нова рецепта' })).toBeVisible();
      expect(screen.getByRole('link', { name: 'Внеси' })).toBeVisible();
      expect(
        screen.getByRole('link', { name: 'Поискай предложения' }),
      ).toBeVisible();
      expect(screen.queryByRole('link', { name: 'Назад' })).toBeNull();
    },
  );

  it('на kiosk регистърът е само за четене: търсене и филтри без „Нова“, „Внеси“ и „Поискай предложения“', async () => {
    const user = userEvent.setup();
    setUpDevice('kiosk', dani.id);
    const queries = serveRecipes();
    server.use(
      http.get(`/api/recipes/${chickenWithRice.id}`, () =>
        HttpResponse.json({ recipe: chickenWithRice }),
      ),
    );

    renderApp('/recipes');

    await screen.findByRole('link', { name: /Омлет/ });
    expect(screen.queryByRole('link', { name: 'Нова рецепта' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Внеси' })).toBeNull();
    expect(
      screen.queryByRole('link', { name: 'Поискай предложения' }),
    ).toBeNull();

    await user.type(screen.getByRole('searchbox', { name: 'Търси' }), 'пиле');
    await expect.poll(() => queries.at(-1)?.get('q')).toBe('пиле');
    await user.click(screen.getByRole('button', { name: 'Филтри' }));
    await user.click(screen.getByRole('button', { name: 'закуска' }));
    await expect.poll(() => queries.at(-1)?.get('tag')).toBe('breakfast');
    await user.click(screen.getByRole('button', { name: 'Готово' }));

    await user.click(screen.getByRole('link', { name: /Пиле с ориз/ }));
    expect(
      await screen.findByRole('heading', { name: 'Пиле с ориз' }),
    ).toBeInTheDocument();
  });

  it('на kiosk празният регистър няма бутони за добавяне', async () => {
    setUpDevice('kiosk');
    serveRecipes([]);

    renderApp('/recipes');

    expect(await screen.findByText('Няма рецепти.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Добави рецепта' })).toBeNull();
    expect(
      screen.queryByRole('link', { name: 'Поискай предложения' }),
    ).toBeNull();
  });

  it('от долната навигация на телефона води към „Рецепти“ и я държи активна', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    serveRecipes();

    renderApp('/');
    const nav = await screen.findByRole('navigation', {
      name: 'Основна навигация',
    });
    await user.click(within(nav).getByRole('link', { name: 'Рецепти' }));

    expect(
      await screen.findByRole('heading', { name: 'Рецепти' }),
    ).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Рецепти' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
