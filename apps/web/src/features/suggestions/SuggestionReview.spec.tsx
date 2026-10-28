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
import { renderApp, setUpDevice } from '../../test/render';
import {
  chickenSkewers,
  doneRequest,
  requestId,
  skewersSuggestion,
  suggestions,
} from '../../test/suggestions';

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
        suggestions: [
          approved.length > 0
            ? { ...suggestion, status: 'approved', recipeId }
            : suggestion,
          ...suggestions.slice(1),
        ],
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

/** Редовете в списъка „Продукти“, в реда, в който се виждат. */
function ingredientLines() {
  return within(screen.getByRole('list', { name: 'Продукти' })).getAllByRole(
    'listitem',
  );
}

/** Листът за един ред продукт. */
function lineSheet() {
  return within(screen.getByRole('dialog', { name: 'Продукт' }));
}

describe('SuggestionReview', () => {
  it('новият продукт е отгоре със „Свържи“; след свързване в листа „Одобри“ праща recipeInput в реда на рецептата и връща към предложенията', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const { approved, searches } = serveReview();

    renderApp(reviewPath);

    expect(
      await screen.findByRole('textbox', { name: 'Заглавие' }),
    ).toHaveValue('Пилешки шишчета');
    // Познатите по име са свързани (точно съвпадение), новият е отгоре и чака „Свържи“.
    expect(ingredientLines().map((line) => line.textContent)).toEqual([
      'сумак · 1 ч.л.Свържи',
      'пилешко филе · 0,6 кг✓',
      'сол · по вкус✓',
    ]);
    expect(searches).toEqual(expect.arrayContaining(['пилешко филе', 'сол']));
    expect(
      screen.getByRole('link', { name: 'Отвори източника' }),
    ).toHaveAttribute('href', chickenSkewers.sourceUrl);
    expect(
      screen.getByRole('link', { name: 'Отвори източника' }),
    ).toHaveAttribute('target', '_blank');

    await user.click(screen.getByRole('button', { name: 'Свържи „сумак“' }));
    const sheet = lineSheet();
    expect(sheet.getByRole('textbox', { name: 'Продукт' })).toHaveValue(
      'сумак',
    );
    expect(
      sheet.getByText('Нов продукт: избери съществуващ или създай нов'),
    ).toBeInTheDocument();
    await user.click(await sheet.findByRole('button', { name: 'сумак' }));
    await user.click(sheet.getByRole('button', { name: 'Готово' }));

    expect(
      within(ingredientLines()[2] as HTMLElement).getByRole('img', {
        name: 'Свързан',
      }),
    ).toBeInTheDocument();
    expect(approved).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Одобри' }));

    // Обратно към заявката: одобреното е отбелязано, другите предложения са там.
    expect(
      await screen.findByRole('heading', { name: 'Предложения' }),
    ).toBeInTheDocument();
    const card = within(
      await screen.findByRole('article', { name: 'Пилешки шишчета' }),
    );
    expect(await card.findByText('Одобрено')).toBeInTheDocument();
    expect(card.getByRole('link', { name: 'Към рецептата' })).toHaveAttribute(
      'href',
      '/recipes/bbbbbbbb-0000-4000-8000-000000000010',
    );
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

  it('продукт без съвпадение се създава в диалога с основна единица по рецептата', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
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

    await user.click(
      await screen.findByRole('button', { name: 'Свържи „кокосово мляко“' }),
    );
    const sheet = lineSheet();
    await user.click(await sheet.findByRole('button', { name: 'Нов продукт' }));
    const form = within(sheet.getByRole('group', { name: 'Нов продукт' }));
    expect(form.getByRole('textbox', { name: 'Име' })).toHaveValue(
      'кокосово мляко',
    );
    expect(
      form.getByRole('combobox', { name: 'Основна единица' }),
    ).toHaveDisplayValue('мл');
    await user.selectOptions(
      form.getByRole('combobox', { name: 'Щанд' }),
      'Консерви и буркани',
    );
    await user.click(form.getByRole('button', { name: 'Създай' }));
    expect(await sheet.findByRole('textbox', { name: 'Продукт' })).toHaveValue(
      'кокосово мляко',
    );
    await user.click(sheet.getByRole('button', { name: 'Готово' }));
    await user.click(screen.getByRole('button', { name: 'Одобри' }));

    await screen.findByRole('heading', { name: 'Предложения' });
    expect(created).toEqual([
      { name: 'кокосово мляко', unit: 'ml', aisle: 'canned' },
    ]);
    expect(approved[0]?.ingredients).toEqual([
      { ingredientId: coconutMilk.id, quantity: 0.4, unit: 'l' },
      { ingredientId: salt.id, quantity: null, unit: 'pinch' },
    ]);
  });

  it('„Одобри“ с несвързан ред не праща и казва кой ред чака', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const { approved } = serveReview();

    renderApp(reviewPath);

    await user.click(await screen.findByRole('button', { name: 'Одобри' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Чака свързване: сумак.',
    );
    expect(
      screen.getByRole('button', { name: 'сумак · 1 ч.л.' }),
    ).toHaveAccessibleDescription('Избери продукт от списъка или създай нов');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(approved).toEqual([]);
  });

  it('с други грешки „Одобри“ казва и кой ред чака, и да се поправят полетата', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const { approved } = serveReview();

    renderApp(reviewPath);

    await user.clear(await screen.findByRole('textbox', { name: 'Заглавие' }));
    await user.click(screen.getByRole('button', { name: 'Одобри' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Чака свързване: сумак. Поправи отбелязаните полета.',
    );
    expect(screen.getByText('Въведи заглавие')).toBeInTheDocument();
    expect(approved).toEqual([]);
  });

  it('без нови продукти „Одобри“ праща направо, без диалог', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const suggestion: RecipeSuggestion = {
      ...skewersSuggestion,
      payload: {
        ...chickenSkewers,
        ingredients: chickenSkewers.ingredients.map((line) => ({
          ...line,
          isNew: false,
        })),
      },
    };
    const { approved } = serveReview(suggestion);

    renderApp(reviewPath);

    expect(
      await screen.findByRole('textbox', { name: 'Заглавие' }),
    ).toHaveValue('Пилешки шишчета');
    await user.click(screen.getByRole('button', { name: 'Одобри' }));

    await screen.findByRole('heading', { name: 'Предложения' });
    expect(approved[0]?.ingredients.map((i) => i.ingredientId)).toEqual([
      chicken.id,
      sumac.id,
      salt.id,
    ]);
  });

  it('„Отхвърли“ праща reject и връща към предложенията', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
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
