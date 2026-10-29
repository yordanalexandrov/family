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

  it('филтър по таг праща tag в query-то', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const queries = serveRecipes();

    renderApp('/recipes');
    await screen.findByRole('link', { name: /Омлет/ });
    await user.click(screen.getByRole('button', { name: 'закуска' }));

    expect(screen.getByRole('button', { name: 'закуска' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect.poll(() => queries.at(-1)?.get('tag')).toBe('breakfast');
    expect(queries[0]?.has('tag')).toBe(false);
  });

  it('няколко тага и интервала за време влизат в query-то; второ натискане маха избора', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const queries = serveRecipes();

    renderApp('/recipes');
    await screen.findByRole('link', { name: /Омлет/ });
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

  it('търсенето праща q, а „покажи архивираните“ праща includeArchived', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const queries = serveRecipes();

    renderApp('/recipes');
    await screen.findByRole('link', { name: /Омлет/ });
    await user.type(screen.getByRole('searchbox', { name: 'Търси' }), 'пиле');
    await expect.poll(() => queries.at(-1)?.get('q')).toBe('пиле');
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
    const sort = screen.getByRole('group', { name: 'Подреди' });
    expect(within(sort).getByRole('radio', { name: 'по име' })).toBeChecked();

    await user.click(within(sort).getByRole('radio', { name: 'по оценка' }));
    await expect.poll(() => queries.at(-1)?.get('sort')).toBe('rating');

    await user.click(within(sort).getByRole('radio', { name: 'по име' }));
    await expect.poll(() => queries.at(-1)?.has('sort')).toBe(false);
  });

  it('без рецепти показва празно състояние', async () => {
    setUpDevice('phone', dani.id);
    serveRecipes([]);

    renderApp('/recipes');

    expect(
      await screen.findByText(
        'Няма рецепти. Добави първата или поискай предложение.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Нова рецепта' })).toHaveAttribute(
      'href',
      '/recipes/new',
    );
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
