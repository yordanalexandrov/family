import type { Recipe } from '@family/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiError, dani, server } from '../../test/msw';
import { chickenWithRice } from '../../test/recipes';
import { renderApp } from '../../test/render';

const KEY = 'family.actingUserId';

function serveRecipe(recipe: Recipe = chickenWithRice) {
  server.use(
    http.get(`/api/recipes/${recipe.id}`, () => HttpResponse.json({ recipe })),
  );
}

describe('RecipeView', () => {
  it('показва продуктите по щандове с количество и единица, и номерираните стъпки', async () => {
    localStorage.setItem(KEY, dani.id);
    serveRecipe();

    renderApp(`/recipes/${chickenWithRice.id}`);

    expect(
      await screen.findByRole('heading', { name: 'Пиле с ориз' }),
    ).toBeInTheDocument();
    expect(screen.getByText('4 порции')).toBeInTheDocument();
    expect(screen.getByText('45 мин')).toBeInTheDocument();

    const meat = screen.getByRole('list', { name: 'Месо и колбаси' });
    expect(within(meat).getByRole('listitem')).toHaveTextContent(
      'пилешко филе500 г',
    );
    expect(
      within(screen.getByRole('list', { name: 'Плод и зеленчук' })).getByRole(
        'listitem',
      ),
    ).toHaveTextContent('лук2 бр.');
    expect(
      within(
        screen.getByRole('list', { name: 'Подправки, сосове и бакалия' }),
      ).getByRole('listitem'),
    ).toHaveTextContent('солпо вкус');

    const steps = within(
      screen.getByRole('list', { name: 'Стъпки' }),
    ).getAllByRole('listitem');
    expect(steps.map((step) => step.textContent)).toEqual([
      'Нарежи пилето.',
      'Задуши с лука.',
    ]);

    expect(screen.getByRole('link', { name: 'Източник' })).toHaveAttribute(
      'href',
      'https://recepti.example/pile-s-oriz',
    );
    expect(
      screen.getByText(/≈ хранителна стойност на 100 г/),
    ).toHaveTextContent('150 kcal');
    expect(screen.getByRole('link', { name: 'Редактирай' })).toHaveAttribute(
      'href',
      `/recipes/${chickenWithRice.id}/edit`,
    );
  });

  it('„Архивирай“ праща заявката и предлага „Върни“', async () => {
    const user = userEvent.setup();
    localStorage.setItem(KEY, dani.id);
    serveRecipe();
    let archived = false;
    server.use(
      http.post(`/api/recipes/${chickenWithRice.id}/archive`, () => {
        archived = true;
        return HttpResponse.json({
          recipe: {
            ...chickenWithRice,
            archivedAt: '2026-10-25T10:00:00.000Z',
          },
        });
      }),
    );

    renderApp(`/recipes/${chickenWithRice.id}`);
    await user.click(await screen.findByRole('button', { name: 'Архивирай' }));

    expect(
      await screen.findByRole('button', { name: 'Върни' }),
    ).toBeInTheDocument();
    expect(archived).toBe(true);
    expect(screen.getByText('Архивирана')).toBeInTheDocument();
  });

  it('за непозната рецепта показва съобщението от api', async () => {
    localStorage.setItem(KEY, dani.id);
    server.use(
      http.get('/api/recipes/:id', () =>
        apiError(404, 'not_found', 'Няма такава рецепта'),
      ),
    );

    renderApp(`/recipes/${chickenWithRice.id}`);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Няма такава рецепта',
    );
  });
});
