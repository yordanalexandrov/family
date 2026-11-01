import type {
  ApproveSuggestionInput,
  RecipeRevision,
  RecipeRevisionRequest,
  RequestSuggestionRevision,
} from '@family/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { dani, server } from '../../test/msw';
import { chicken, ingredients, salt } from '../../test/recipes';
import { renderApp, setUpDevice } from '../../test/render';
import {
  doneRequest,
  requestId,
  skewersSuggestion,
  suggestions,
} from '../../test/suggestions';

const INSTRUCTION = 'шишчетата са за 2 порции, не за 4';
const reviewPath = `/recipes/suggest/${requestId}/${skewersSuggestion.id}`;

const revision: RecipeRevision = {
  changes: 'Порциите са 2, а пилето е половината.',
  servings: 2,
  prepMinutes: 25,
  ingredients: [
    { ingredient: chicken, quantity: 0.3, unit: 'kg' },
    { ingredient: salt, quantity: null, unit: 'pinch' },
  ],
  steps: [{ text: 'Нарежи пилето на кубчета.' }, { text: 'Нанижи и изпечи.' }],
  preparation: [],
  droppedPhotos: 0,
};

const pending: RecipeRevisionRequest = {
  id: 'eeeeeeee-0000-4000-8000-000000000001',
  suggestionId: skewersSuggestion.id,
  instruction: INSTRUCTION,
  status: 'pending',
  requestedBy: dani.id,
  createdAt: '2026-11-01T10:00:00.000Z',
};

/**
 * The request with the suggestion, the product search, the revision of the suggestion (done at once) and the approval;
 * returns the bodies of `POST …/revisions` and of the approval.
 */
function serveSuggestionRevise() {
  const posts: RequestSuggestionRevision[] = [];
  const approved: ApproveSuggestionInput[] = [];
  server.use(
    http.get(`/api/recipe-suggestions/requests/${requestId}`, () =>
      HttpResponse.json({ request: doneRequest, suggestions }),
    ),
    http.get('/api/recipes', () => HttpResponse.json({ recipes: [] })),
    http.get('/api/ingredients', ({ request }) => {
      const q = new URL(request.url).searchParams.get('q') ?? '';
      return HttpResponse.json({
        ingredients: ingredients.filter((i) => i.name.includes(q)),
      });
    }),
    http.post(
      `/api/recipe-suggestions/${skewersSuggestion.id}/revisions`,
      async ({ request }) => {
        posts.push((await request.json()) as RequestSuggestionRevision);
        return HttpResponse.json({ request: pending }, { status: 202 });
      },
    ),
    http.get(`/api/recipes/revisions/${pending.id}`, () =>
      HttpResponse.json({
        request: {
          ...pending,
          status: 'done',
          revision,
          finishedAt: '2026-11-01T10:00:40.000Z',
        },
      }),
    ),
    http.post(
      `/api/recipe-suggestions/${skewersSuggestion.id}/approve`,
      async ({ request }) => {
        approved.push((await request.json()) as ApproveSuggestionInput);
        return HttpResponse.json(
          {
            recipe: {
              id: 'bbbbbbbb-0000-4000-8000-000000000010',
              title: 'Пилешки шишчета',
              servings: 2,
              tags: [],
              steps: revision.steps,
              ingredients: [],
              preparation: [],
              createdAt: '2026-11-01T10:01:00.000Z',
              updatedAt: '2026-11-01T10:01:00.000Z',
            },
            suggestion: { ...skewersSuggestion, status: 'approved' },
          },
          { status: 201 },
        );
      },
    ),
  );
  return { posts, approved };
}

function listTexts(name: string) {
  return within(screen.getByRole('list', { name }))
    .getAllByRole('listitem')
    .map((item) => item.textContent);
}

/** Opens the review, sets the servings to `servings`, opens the sheet and sends the instruction. */
async function send(user: ReturnType<typeof userEvent.setup>, servings = '4') {
  setUpDevice('phone', dani.id);
  renderApp(reviewPath);
  const servingsField = await screen.findByLabelText('Порции');
  await user.clear(servingsField);
  await user.type(servingsField, servings);
  await user.click(
    await screen.findByRole('button', { name: '✏️ Поправи с AI' }),
  );
  const sheet = await screen.findByRole('dialog', { name: 'Поправи с AI' });
  await user.type(
    within(sheet).getByLabelText('Какво да се промени?'),
    INSTRUCTION,
  );
  await user.click(within(sheet).getByRole('button', { name: 'Изпрати' }));
  return sheet;
}

describe('„Поправи с AI“ в прегледа на предложение', () => {
  it('праща указанието с рецептата от формата, както е сега, и я сравнява с поправката', async () => {
    const user = userEvent.setup();
    const { posts } = serveSuggestionRevise();

    const sheet = await send(user, '5');

    expect(
      await within(sheet).findByText(revision.changes),
    ).toBeInTheDocument();
    expect(posts).toEqual([
      {
        instruction: INSTRUCTION,
        recipe: {
          title: 'Пилешки шишчета',
          servings: 5,
          prepMinutes: 25,
          ingredients: [
            { name: 'пилешко филе', quantity: 0.6, unit: 'kg' },
            { name: 'сумак', quantity: 1, unit: 'tsp' },
            { name: 'сол', quantity: null, unit: 'pinch' },
          ],
          steps: [{ text: 'Нарежи пилето.' }, { text: 'Нанижи и изпечи.' }],
          preparation: [],
        },
      },
    ]);
    expect(listTexts('Продукти: сега')).toEqual([
      'пилешко филе · 0,6 кг',
      'сумак · 1 ч.л. (нов продукт)',
      'сол · по вкус',
    ]);
    expect(screen.getByText('5 порции · 25 мин')).toBeInTheDocument();
    expect(screen.getByText('2 порции · 25 мин')).toBeInTheDocument();
  });

  it('„Приеми“ сменя формата за преглед, а „Одобри“ праща поправката с одобрението', async () => {
    const user = userEvent.setup();
    const { approved } = serveSuggestionRevise();
    await send(user);

    await user.click(await screen.findByRole('button', { name: 'Приеми' }));

    expect(
      screen.queryByRole('dialog', { name: 'Поправи с AI' }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Порции')).toHaveValue('2');
    expect(listTexts('Стъпки')).toEqual(
      revision.steps.map((step) => step.text),
    );
    expect(listTexts('Продукти')).toEqual([
      'пилешко филе · 0,3 кг✓',
      'сол · по вкус✓',
    ]);
    expect(approved).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Одобри' }));

    await vi.waitFor(() => expect(approved).toHaveLength(1));
    expect(approved[0]).toMatchObject({
      revisionId: pending.id,
      servings: 2,
      steps: revision.steps,
      ingredients: [
        { ingredientId: chicken.id, quantity: 0.3, unit: 'kg' },
        { ingredientId: salt.id, quantity: null, unit: 'pinch' },
      ],
    });
  });
});
