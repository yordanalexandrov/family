import type {
  RecipeImportDetail,
  RecipeImportParams,
  RecipeImportRequest,
  RecipeInput,
} from '@family/shared';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  doneImport,
  importedSuggestion,
  importId,
  importText,
  importUrl,
  pendingImport,
  sumac,
} from '../../test/imports';
import { dani, server } from '../../test/msw';
import { chicken, omelette, salt } from '../../test/recipes';
import { renderApp, setUpDevice } from '../../test/render';

afterEach(() => {
  vi.useRealTimers();
});

const DONE: RecipeImportDetail = {
  request: doneImport,
  text: importText,
  suggestion: importedSuggestion,
  ingredients: [chicken, salt],
};

/**
 * The api of an import: the list, `POST` (returns the pending import), `GET /:id` in the given states (the last
 * repeats), the ingredient search (сумак is not in the registry), creating an ingredient and approval.
 */
function serveImport(...states: RecipeImportDetail[]) {
  const posted: RecipeImportParams[] = [];
  const created: unknown[] = [];
  const approved: RecipeInput[] = [];
  let detailCalls = 0;
  const recipeId = 'bbbbbbbb-0000-4000-8000-000000000020';
  server.use(
    http.get('/api/recipes', () => HttpResponse.json({ recipes: [] })),
    http.get('/api/recipe-imports', () =>
      HttpResponse.json({ requests: [] satisfies RecipeImportRequest[] }),
    ),
    http.post('/api/recipe-imports', async ({ request }) => {
      posted.push((await request.json()) as RecipeImportParams);
      return HttpResponse.json({ request: pendingImport }, { status: 202 });
    }),
    http.get(`/api/recipe-imports/${importId}`, () => {
      const state = states[Math.min(detailCalls, states.length - 1)];
      detailCalls += 1;
      return HttpResponse.json(state);
    }),
    http.get('/api/ingredients', ({ request }) => {
      const q = new URL(request.url).searchParams.get('q') ?? '';
      return HttpResponse.json({
        ingredients: [chicken, salt].filter((i) => i.name.includes(q)),
      });
    }),
    http.post('/api/ingredients', async ({ request }) => {
      created.push(await request.json());
      return HttpResponse.json({ ingredient: sumac }, { status: 201 });
    }),
    http.post(
      `/api/recipe-suggestions/${importedSuggestion.id}/approve`,
      async ({ request }) => {
        const input = (await request.json()) as RecipeInput;
        approved.push(input);
        return HttpResponse.json(
          {
            recipe: {
              ...omelette,
              id: recipeId,
              title: input.title,
              ingredients: [],
            },
            suggestion: {
              ...importedSuggestion,
              status: 'approved',
              recipeId,
            },
          },
          { status: 201 },
        );
      },
    ),
    http.get(`/api/recipes/${recipeId}`, () =>
      HttpResponse.json({
        recipe: {
          ...omelette,
          id: recipeId,
          title: importedSuggestion.payload.title,
          ingredients: [],
        },
      }),
    ),
  );
  return { posted, created, approved, detailCalls: () => detailCalls };
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

describe('ImportScreen', () => {
  it('текст → изчакване → преглед със свързани продукти → нов продукт с попълнена форма → Одобри', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({
      advanceTimers: (ms) => vi.advanceTimersByTime(ms),
    });
    setUpDevice('phone', dani.id);
    const api = serveImport(
      { request: pendingImport, text: importText, ingredients: [] },
      DONE,
    );

    renderApp('/recipes');
    await user.click(await screen.findByRole('link', { name: 'Внеси' }));

    expect(
      await screen.findByRole('heading', { name: 'Внеси рецепта' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Текст' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.click(
      screen.getByRole('textbox', { name: 'Текст на рецептата' }),
    );
    await user.paste(importText);
    await user.type(
      screen.getByRole('textbox', {
        name: 'Линк към източника (по желание)',
      }),
      importUrl,
    );
    await user.click(screen.getByRole('button', { name: 'Внеси' }));

    expect(
      await screen.findByText('Чета рецептата… обикновено отнема до минута'),
    ).toBeInTheDocument();
    expect(api.posted).toEqual([
      { kind: 'text', text: importText, url: importUrl },
    ]);

    await act(() => vi.advanceTimersByTimeAsync(3000));

    // Прегледът: допусканията на мястото на „защо“, продуктите от регистъра са свързани, новият е откроен.
    expect(
      await screen.findByRole('textbox', { name: 'Заглавие' }),
    ).toHaveValue('Пилешко филе със сумак');
    expect(
      screen.getByText('Порциите не са дадени: по количествата са 4.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Отвори източника' }),
    ).toHaveAttribute('href', importUrl);
    expect(
      screen.getByRole('textbox', { name: 'Източник (линк)' }),
    ).toHaveValue(importUrl);
    expect(ingredientLines().map((line) => line.textContent)).toEqual([
      'сумак · 1 ч.л.Свържи',
      'пилешко филе · 600 г✓',
      'сол · по вкус✓',
    ]);

    await user.click(screen.getByRole('button', { name: 'Свържи „сумак“' }));
    const sheet = lineSheet();
    await user.click(await sheet.findByRole('button', { name: 'Нов продукт' }));
    // Формата идва попълнена с предложението на агента: име, основна единица и щанд.
    const form = within(sheet.getByRole('group', { name: 'Нов продукт' }));
    expect(form.getByRole('textbox', { name: 'Име' })).toHaveValue('сумак');
    expect(
      form.getByRole('combobox', { name: 'Основна единица' }),
    ).toHaveDisplayValue('г');
    expect(form.getByRole('combobox', { name: 'Щанд' })).toHaveDisplayValue(
      'Подправки, сосове и бакалия',
    );
    await user.click(form.getByRole('button', { name: 'Създай' }));
    expect(await sheet.findByRole('textbox', { name: 'Продукт' })).toHaveValue(
      'сумак',
    );
    await user.click(sheet.getByRole('button', { name: 'Готово' }));
    await user.click(screen.getByRole('button', { name: 'Одобри' }));

    // Одобрената рецепта се отваря.
    expect(
      await screen.findByRole('heading', { name: 'Пилешко филе със сумак' }),
    ).toBeInTheDocument();
    expect(api.created).toEqual([
      { name: 'сумак', unit: 'g', aisle: 'spices' },
    ]);
    expect(api.approved).toEqual([
      {
        title: 'Пилешко филе със сумак',
        servings: 4,
        prepMinutes: 40,
        tags: ['dinner'],
        steps: ['Овкусете пилето.', 'Изпечете го 30 минути.'],
        sourceUrl: importUrl,
        ingredients: [
          {
            ingredientId: chicken.id,
            quantity: 600,
            unit: 'g',
            note: 'пилешки гърди',
          },
          { ingredientId: sumac.id, quantity: 1, unit: 'tsp', note: 'смлян' },
          { ingredientId: salt.id, quantity: null, unit: 'pinch' },
        ],
      },
    ]);
  });

  it('при no_results показва причината на агента, а „Опитай пак“ внася същия текст наново', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const api = serveImport({
      request: {
        ...pendingImport,
        status: 'failed',
        error: 'no_results',
        noResults: 'Текстът е статия за градинарство, не рецепта.',
        finishedAt: '2026-10-27T18:01:00.000Z',
      },
      text: importText,
      ingredients: [],
    });

    renderApp(`/recipes/import/${importId}`);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Текстът е статия за градинарство, не рецепта.',
    );
    await user.click(screen.getByRole('button', { name: 'Опитай пак' }));

    expect(api.posted).toEqual([
      { kind: 'text', text: importText, url: importUrl },
    ]);
  });

  it('при друга грешка показва съобщението по кода', async () => {
    setUpDevice('phone', dani.id);
    serveImport({
      request: {
        ...pendingImport,
        status: 'failed',
        error: 'timeout',
        finishedAt: '2026-10-27T18:03:00.000Z',
      },
      text: importText,
      ingredients: [],
    });

    renderApp(`/recipes/import/${importId}`);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не успях навреме, опитай пак',
    );
  });

  it('под формата са последните внасяния със статус, заглавие и връзка', async () => {
    setUpDevice('phone', dani.id);
    serveImport(DONE);
    server.use(
      http.get('/api/recipe-imports', () =>
        HttpResponse.json({
          requests: [
            doneImport,
            {
              ...pendingImport,
              id: 'eeeeeeee-0000-4000-8000-000000000002',
              url: undefined,
            },
          ],
        }),
      ),
    );

    renderApp('/recipes/import');

    const recent = within(
      await screen.findByRole('region', { name: 'Последни внасяния' }),
    );
    const done = await recent.findByRole('link', {
      name: /Пилешко филе със сумак/,
    });
    expect(done).toHaveAttribute('href', `/recipes/import/${importId}`);
    expect(done).toHaveTextContent('готова');
    const pending = recent.getByRole('link', { name: /Текст/ });
    expect(pending).toHaveTextContent('чака');
    expect(pending).toHaveAttribute(
      'href',
      '/recipes/import/eeeeeeee-0000-4000-8000-000000000002',
    );
  });

  it('показва линка на източника четимо (кирилица), а одобрението го праща както е запазен', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const encoded =
      'https://recepti.example/r-1-%D0%91%D0%B0%D0%BD%D0%B8%D1%86%D0%B0';
    const api = serveImport({
      request: { ...doneImport, source: 'url', url: encoded },
      suggestion: {
        ...importedSuggestion,
        payload: {
          ...importedSuggestion.payload,
          ingredients: importedSuggestion.payload.ingredients.filter(
            (line) => line.ingredientId !== null,
          ),
        },
      },
      ingredients: [chicken, salt],
    });

    renderApp(`/recipes/import/${importId}`);

    expect(
      await screen.findByRole('textbox', { name: 'Източник (линк)' }),
    ).toHaveValue('https://recepti.example/r-1-Баница');
    expect(
      screen.getByRole('link', { name: 'Отвори източника' }),
    ).toHaveAttribute('href', encoded);
    await user.click(screen.getByRole('button', { name: 'Одобри' }));

    await screen.findByRole('heading', { name: 'Пилешко филе със сумак' });
    expect(api.approved[0]?.sourceUrl).toBe(encoded);
  });

  it('един нов продукт на два реда: създаден от единия, свързва и другия', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const sumacLine = importedSuggestion.payload.ingredients[1];
    if (!sumacLine) {
      throw new Error('fixture without the сумак line');
    }
    const api = serveImport({
      ...DONE,
      suggestion: {
        ...importedSuggestion,
        payload: {
          ...importedSuggestion.payload,
          ingredients: [
            ...importedSuggestion.payload.ingredients,
            {
              ...sumacLine,
              newProduct: { name: 'Сумак', unit: 'g', aisle: 'spices' },
              quantity: 2,
              note: 'за поръсване',
            },
          ],
        },
      },
    });

    renderApp(`/recipes/import/${importId}`);
    const [first, second] = await screen.findAllByRole('button', {
      name: /^Свържи „сумак“$/i,
    });
    if (!first || !second) {
      throw new Error('expected two сумак lines');
    }
    await user.click(first);
    const sheet = lineSheet();
    await user.click(await sheet.findByRole('button', { name: 'Нов продукт' }));
    await user.click(sheet.getByRole('button', { name: 'Създай' }));
    expect(await sheet.findByRole('textbox', { name: 'Продукт' })).toHaveValue(
      'сумак',
    );
    await user.click(sheet.getByRole('button', { name: 'Готово' }));

    // И двата реда са свързани, без да се отваря вторият.
    expect(
      screen.queryByRole('button', { name: /^Свържи/ }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Одобри' }));

    await screen.findByRole('heading', { name: 'Пилешко филе със сумак' });
    expect(api.created).toHaveLength(1);
    expect(
      api.approved[0]?.ingredients.filter(
        (line) => line.ingredientId === sumac.id,
      ),
    ).toHaveLength(2);
  });
});
