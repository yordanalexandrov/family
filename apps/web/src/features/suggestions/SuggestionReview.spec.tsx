import type {
  Ingredient,
  Recipe,
  RecipeInput,
  RecipeSuggestion,
} from '@family/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { dani, server } from '../../test/msw';
import { chicken, ingredients, omelette, salt } from '../../test/recipes';
import { renderApp } from '../../test/render';
import {
  chickenSkewers,
  doneRequest,
  requestId,
  skewersSuggestion,
  suggestions,
} from '../../test/suggestions';

const KEY = 'family.actingUserId';

const sumac: Ingredient = {
  id: 'aaaaaaaa-0000-4000-8000-000000000010',
  name: 'сумак',
  unit: 'g',
  aisle: 'spices',
};

const coconutMilk: Ingredient = {
  id: 'aaaaaaaa-0000-4000-8000-000000000011',
  name: 'кокосово мляко',
  unit: 'ml',
  aisle: 'canned',
};

const reviewPath = `/recipes/suggest/${requestId}/${skewersSuggestion.id}`;

/** Заявката с предложенията, търсене на продукти (ILIKE) и одобрение; връща пратените `recipeInput`. */
function serveReview(
  suggestion: RecipeSuggestion = skewersSuggestion,
  known: Ingredient[] = [...ingredients, sumac],
) {
  const approved: RecipeInput[] = [];
  const searches: string[] = [];
  const recipeId = 'bbbbbbbb-0000-4000-8000-000000000010';
  const stored = (): Recipe => ({
    ...omelette,
    id: recipeId,
    title: approved.at(-1)?.title ?? omelette.title,
    ingredients: [],
  });
  server.use(
    http.get(`/api/recipe-suggestions/requests/${requestId}`, () =>
      HttpResponse.json({
        request: doneRequest,
        suggestions: [suggestion, ...suggestions.slice(1)],
      }),
    ),
    http.get('/api/ingredients', ({ request }) => {
      const q = new URL(request.url).searchParams.get('q') ?? '';
      searches.push(q);
      return HttpResponse.json({
        ingredients: known.filter((i) => i.name.includes(q)),
      });
    }),
    http.post(
      `/api/recipe-suggestions/${suggestion.id}/approve`,
      async ({ request }) => {
        const body = (await request.json()) as RecipeInput;
        approved.push(body);
        const recipe = stored();
        return HttpResponse.json(
          {
            recipe,
            suggestion: {
              ...suggestion,
              status: 'approved',
              recipeId: recipe.id,
            },
          },
          { status: 201 },
        );
      },
    ),
    http.get(`/api/recipes/${recipeId}`, () =>
      HttpResponse.json({ recipe: stored() }),
    ),
  );
  return { approved, searches };
}

function ingredientRow(index: number) {
  return screen.getAllByRole('group', { name: /^Продукт \d+$/ })[
    index
  ] as HTMLElement;
}

describe('SuggestionReview', () => {
  it('нов продукт блокира „Одобри“; след избор праща recipeInput с реални ingredientId', async () => {
    const user = userEvent.setup();
    localStorage.setItem(KEY, dani.id);
    const { approved, searches } = serveReview();

    renderApp(reviewPath);

    expect(
      await screen.findByRole('textbox', { name: 'Заглавие' }),
    ).toHaveValue('Пилешки шишчета');
    // Познатите по име са резолвнати (точно съвпадение), новият е откроен.
    expect(
      within(ingredientRow(0)).getByRole('textbox', { name: 'Продукт' }),
    ).toHaveValue('пилешко филе');
    expect(
      within(ingredientRow(0)).queryByText(/Непознат продукт/),
    ).not.toBeInTheDocument();
    expect(
      within(ingredientRow(1)).getByText(
        'Нов продукт: избери съществуващ или създай нов',
      ),
    ).toBeInTheDocument();
    expect(searches).toEqual(expect.arrayContaining(['пилешко филе', 'сол']));
    expect(
      screen.getByRole('link', { name: 'Отвори източника' }),
    ).toHaveAttribute('href', chickenSkewers.sourceUrl);
    expect(
      screen.getByRole('link', { name: 'Отвори източника' }),
    ).toHaveAttribute('target', '_blank');

    const approve = screen.getByRole('button', { name: 'Одобри' });
    expect(approve).toBeDisabled();

    await user.click(
      await within(ingredientRow(1)).findByRole('button', { name: 'сумак' }),
    );
    expect(approve).toBeEnabled();
    await user.click(approve);

    expect(
      await screen.findByRole('heading', { name: 'Пилешки шишчета' }),
    ).toBeInTheDocument();
    expect(approved).toEqual([
      {
        title: 'Пилешки шишчета',
        servings: 4,
        prepMinutes: 25,
        tags: ['dinner', 'quick'],
        steps: ['Нарежи пилето.', 'Нанижи и изпечи.'],
        sourceUrl: chickenSkewers.sourceUrl,
        ingredients: [
          { ingredientId: chicken.id, quantity: 0.6, unit: 'kg' },
          { ingredientId: sumac.id, quantity: 1, unit: 'tsp' },
          { ingredientId: salt.id, quantity: null, unit: 'pinch' },
        ],
      },
    ]);
  });

  it('продукт без съвпадение се създава с основна единица по рецептата', async () => {
    const user = userEvent.setup();
    localStorage.setItem(KEY, dani.id);
    const suggestion: RecipeSuggestion = {
      ...skewersSuggestion,
      payload: {
        ...chickenSkewers,
        ingredients: [
          // isNew: false, но в регистъра го няма: също е нов.
          { name: 'кокосово мляко', isNew: false, quantity: 0.4, unit: 'l' },
          { name: 'сол', isNew: false, quantity: null, unit: 'pinch' },
        ],
      },
    };
    const { approved } = serveReview(suggestion, ingredients);
    const created: unknown[] = [];
    server.use(
      http.post('/api/ingredients', async ({ request }) => {
        created.push(await request.json());
        return HttpResponse.json({ ingredient: coconutMilk }, { status: 201 });
      }),
    );

    renderApp(reviewPath);

    const row = await screen.findByRole('group', { name: 'Продукт 1' });
    expect(screen.getByRole('button', { name: 'Одобри' })).toBeDisabled();
    await user.click(
      await within(row).findByRole('button', { name: 'Нов продукт' }),
    );
    const form = within(row).getByRole('group', { name: 'Нов продукт' });
    expect(
      within(form).getByRole('combobox', { name: 'Основна единица' }),
    ).toHaveDisplayValue('мл');
    await user.selectOptions(
      within(form).getByRole('combobox', { name: 'Щанд' }),
      'Консерви и буркани',
    );
    await user.click(within(form).getByRole('button', { name: 'Създай' }));
    await user.click(screen.getByRole('button', { name: 'Одобри' }));

    await screen.findByRole('heading', { name: 'Пилешки шишчета' });
    expect(created).toEqual([
      { name: 'кокосово мляко', unit: 'ml', aisle: 'canned' },
    ]);
    expect(approved[0]?.ingredients).toEqual([
      { ingredientId: coconutMilk.id, quantity: 0.4, unit: 'l' },
      { ingredientId: salt.id, quantity: null, unit: 'pinch' },
    ]);
  });

  it('„Отхвърли“ праща reject и връща към предложенията', async () => {
    const user = userEvent.setup();
    localStorage.setItem(KEY, dani.id);
    serveReview();
    const rejected: string[] = [];
    server.use(
      http.post(
        `/api/recipe-suggestions/${skewersSuggestion.id}/reject`,
        () => {
          rejected.push(skewersSuggestion.id);
          return HttpResponse.json({
            suggestion: { ...skewersSuggestion, status: 'rejected' },
          });
        },
      ),
    );

    renderApp(reviewPath);
    await user.click(await screen.findByRole('button', { name: 'Отхвърли' }));

    expect(
      await screen.findByRole('heading', { name: 'Предложения' }),
    ).toBeInTheDocument();
    expect(rejected).toEqual([skewersSuggestion.id]);
  });
});
