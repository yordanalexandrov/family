import type {
  Recipe,
  RecipeRevision,
  RecipeRevisionRequest,
} from '@family/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { dani, server } from '../../test/msw';
import {
  chicken,
  chickenWithRice,
  omelette,
  toSummary,
} from '../../test/recipes';
import { renderApp, setUpDevice } from '../../test/render';

const INSTRUCTION = 'пилето иска още 10 минути';
const REVISION_ID = 'dddddddd-0000-4000-8000-000000000001';
const NEW_ID = 'dddddddd-0000-4000-8000-000000000002';

/** The recipe waits for review of its revision. */
const recipe: Recipe = {
  ...chickenWithRice,
  openRevision: { id: REVISION_ID, status: 'done' },
};

const revision: RecipeRevision = {
  changes: 'Задушаването е 30 минути.',
  servings: 4,
  prepMinutes: 55,
  ingredients: [{ ingredient: chicken, quantity: 500, unit: 'g' }],
  steps: [{ text: 'Нарежи пилето.' }, { text: 'Задуши с лука 30 минути.' }],
  preparation: [],
  droppedPhotos: 0,
};

const done: RecipeRevisionRequest = {
  id: REVISION_ID,
  recipeId: recipe.id,
  instruction: INSTRUCTION,
  status: 'done',
  revision,
  requestedBy: dani.id,
  createdAt: '2026-11-01T10:00:00.000Z',
  finishedAt: '2026-11-01T10:00:40.000Z',
  stale: false,
};

/** The recipe (`served`), its revision `REVISION_ID` (`open`), „Отхвърли“ and new revisions; returns what was sent. */
function serve(served: Recipe, open: RecipeRevisionRequest = done) {
  const posts: { instruction: string }[] = [];
  const rejected: string[] = [];
  server.use(
    http.get(`/api/recipes/${served.id}`, () =>
      HttpResponse.json({ recipe: served }),
    ),
    http.get(`/api/recipes/revisions/${REVISION_ID}`, () =>
      HttpResponse.json({ request: open }),
    ),
    http.get(`/api/recipes/revisions/${NEW_ID}`, () =>
      HttpResponse.json({
        request: { ...open, id: NEW_ID, status: 'pending', stale: false },
      }),
    ),
    http.post(`/api/recipes/revisions/${REVISION_ID}/reject`, () => {
      rejected.push(REVISION_ID);
      return HttpResponse.json({
        request: { ...open, decision: 'rejected' },
      });
    }),
    http.post(`/api/recipes/${served.id}/revisions`, async ({ request }) => {
      const body = (await request.json()) as { instruction: string };
      posts.push(body);
      return HttpResponse.json(
        {
          request: {
            ...open,
            id: NEW_ID,
            instruction: body.instruction,
            status: 'pending',
            revision: undefined,
            stale: false,
          },
        },
        { status: 202 },
      );
    }),
  );
  return { posts, rejected };
}

describe('Поправка чака преглед', () => {
  it('личи в регистъра на рецептата, която я има, и само на нея', async () => {
    setUpDevice('phone', dani.id);
    server.use(
      http.get('/api/recipes', () =>
        HttpResponse.json({ recipes: [recipe, omelette].map(toSummary) }),
      ),
    );

    renderApp('/recipes');

    const card = await screen.findByRole('link', { name: /Пиле с ориз/ });
    expect(within(card).getByText('Поправка чака преглед')).toBeInTheDocument();
    expect(
      within(screen.getByRole('link', { name: /Омлет/ })).queryByText(
        'Поправка чака преглед',
      ),
    ).not.toBeInTheDocument();
  });

  it('от изгледа на рецептата отваря редакцията с листа на чакащата поправка', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    serve(recipe);
    renderApp(`/recipes/${recipe.id}`);

    await user.click(
      await screen.findByRole('link', { name: 'Поправка чака преглед' }),
    );

    const sheet = await screen.findByRole('dialog', { name: 'Поправи с AI' });
    expect(
      await within(sheet).findByText(revision.changes),
    ).toBeInTheDocument();
    expect(
      within(sheet).getByRole('button', { name: 'Приеми' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Редакция' }),
    ).toBeInTheDocument();
  });

  it('на kiosk изгледът я казва без връзка към редакцията', async () => {
    setUpDevice('kiosk');
    serve(recipe);

    renderApp(`/recipes/${recipe.id}`);

    expect(
      await screen.findByText('Поправка чака преглед'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Поправка чака преглед' }),
    ).not.toBeInTheDocument();
  });

  it('няма я в изгледа на рецепта без отворена поправка', async () => {
    setUpDevice('phone', dani.id);
    serve(chickenWithRice);

    renderApp(`/recipes/${chickenWithRice.id}`);

    await screen.findByRole('heading', { name: 'Пиле с ориз' });
    expect(screen.queryByText('Поправка чака преглед')).not.toBeInTheDocument();
  });

  it('редакцията, затворена без запис и отворена пак, продължава чакащата поправка', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const { posts } = serve(recipe);
    renderApp(`/recipes/${recipe.id}/edit`);

    await user.click(
      await screen.findByRole('button', { name: '✏️ Поправи с AI' }),
    );

    const sheet = await screen.findByRole('dialog', { name: 'Поправи с AI' });
    expect(
      await within(sheet).findByText(revision.changes),
    ).toBeInTheDocument();
    expect(
      within(sheet).queryByLabelText('Какво да се промени?'),
    ).not.toBeInTheDocument();
    expect(posts).toEqual([]);
  });

  it('втора поправка води към чакащата', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    serve(chickenWithRice);
    server.use(
      http.post(`/api/recipes/${chickenWithRice.id}/revisions`, () =>
        HttpResponse.json(
          {
            error: 'conflict',
            code: 'revision_open',
            message: 'Поправка чака преглед',
            revisionId: REVISION_ID,
          },
          { status: 409 },
        ),
      ),
    );
    renderApp(`/recipes/${chickenWithRice.id}/edit`);
    await user.click(
      await screen.findByRole('button', { name: '✏️ Поправи с AI' }),
    );
    const sheet = await screen.findByRole('dialog', { name: 'Поправи с AI' });
    await user.type(
      within(sheet).getByLabelText('Какво да се промени?'),
      'добави сол',
    );
    await user.click(within(sheet).getByRole('button', { name: 'Изпрати' }));

    expect(
      await within(sheet).findByText('Поправка чака преглед'),
    ).toBeInTheDocument();
    await user.click(
      within(sheet).getByRole('button', { name: 'Отвори поправката' }),
    );

    expect(
      await within(sheet).findByText(revision.changes),
    ).toBeInTheDocument();
  });

  it('записана след поправката рецепта няма „Приеми“, а „Пусни пак“ отхвърля старата и пуска същото указание', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const { posts, rejected } = serve(recipe, { ...done, stale: true });
    renderApp(`/recipes/${recipe.id}/edit`);
    await user.click(
      await screen.findByRole('button', { name: '✏️ Поправи с AI' }),
    );
    const sheet = await screen.findByRole('dialog', { name: 'Поправи с AI' });

    expect(
      await within(sheet).findByText('Рецептата е записана след поправката.'),
    ).toBeInTheDocument();
    expect(
      within(sheet).queryByRole('button', { name: 'Приеми' }),
    ).not.toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Пусни пак' }));

    await vi.waitFor(() =>
      expect(posts).toEqual([{ instruction: INSTRUCTION }]),
    );
    expect(rejected).toEqual([REVISION_ID]);
    expect(await within(sheet).findByText('Мисли…')).toBeInTheDocument();
  });
});
