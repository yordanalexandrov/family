import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { dani, server } from '../../test/msw';
import { chickenWithRice, omelette, toSummary } from '../../test/recipes';
import { renderApp } from '../../test/render';

const KEY = 'family.actingUserId';

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
  it('показва рецептите от регистъра с време и тагове', async () => {
    localStorage.setItem(KEY, dani.id);
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
    localStorage.setItem(KEY, dani.id);
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

  it('търсенето праща q, а „покажи архивираните“ праща includeArchived', async () => {
    const user = userEvent.setup();
    localStorage.setItem(KEY, dani.id);
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

  it('без рецепти показва празно състояние', async () => {
    localStorage.setItem(KEY, dani.id);
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

  it('от началния екран води към „Рецепти“', async () => {
    const user = userEvent.setup();
    localStorage.setItem(KEY, dani.id);
    serveRecipes();

    renderApp('/');
    await user.click(await screen.findByRole('link', { name: 'Рецепти' }));

    expect(
      await screen.findByRole('heading', { name: 'Рецепти' }),
    ).toBeInTheDocument();
  });
});
