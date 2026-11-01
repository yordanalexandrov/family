import type { Recipe } from '@family/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { dani, server } from '../../test/msw';
import { goOffline } from '../../test/network';
import { chickenWithRice } from '../../test/recipes';
import { renderApp, setUpDevice } from '../../test/render';

/** Една стъпка: „Готово“ е веднага. */
const stew: Recipe = {
  ...chickenWithRice,
  rating: 3,
  steps: [{ text: 'Задуши пилето с лука.' }],
};

const INSTRUCTION = 'картофите искат още 20 минути';
const REVISION_ID = 'dddddddd-0000-4000-8000-000000000001';

/** `POST /api/recipes/:id/revisions` → 202 с `pending`; връща какво е пратено. */
function serveRevisions() {
  const posts: unknown[] = [];
  server.use(
    http.post(`/api/recipes/${stew.id}/revisions`, async ({ request }) => {
      const body = (await request.json()) as { instruction: string };
      posts.push(body);
      return HttpResponse.json(
        {
          request: {
            id: REVISION_ID,
            recipeId: stew.id,
            instruction: body.instruction,
            status: 'pending',
            requestedBy: dani.id,
            createdAt: '2026-11-01T18:00:00.000Z',
            stale: false,
          },
        },
        { status: 202 },
      );
    }),
  );
  return posts;
}

function serveRecipe(recipe: Recipe = stew) {
  server.use(
    http.get(`/api/recipes/${recipe.id}`, () => HttpResponse.json({ recipe })),
    http.get('/api/recipes', () => HttpResponse.json({ recipes: [] })),
  );
}

/** Влиза в Готвене от изгледа на рецептата и натиска „Готово“; връща листа „Как мина?“. */
async function finishCooking(user: ReturnType<typeof userEvent.setup>) {
  const { router } = renderApp(`/recipes/${stew.id}`);
  await user.click(await screen.findByRole('link', { name: 'Готви' }));
  await user.click(await screen.findByRole('button', { name: 'Готово' }));
  const sheet = await screen.findByRole('dialog', { name: 'Как мина?' });
  return { router, sheet };
}

describe('Обратна връзка след готвене', () => {
  it('„Готово“ отваря „Как мина?“, а „Пропусни“ връща, откъдето си влязъл', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    serveRecipe();

    const { router, sheet } = await finishCooking(user);
    expect(router.state.location.pathname).toBe(`/recipes/${stew.id}/cook`);
    expect(
      within(sheet).getByLabelText('Какво да се промени?'),
    ).toBeInTheDocument();

    await user.click(within(sheet).getByRole('button', { name: 'Пропусни' }));

    expect(
      await screen.findByRole('heading', { name: stew.title }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/recipes/${stew.id}`);
  });

  it('звездите показват текущата оценка, а смяната се пише веднага', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    serveRecipe();
    const rated: unknown[] = [];
    server.use(
      http.put(`/api/recipes/${stew.id}/rating`, async ({ request }) => {
        const body = (await request.json()) as { rating: number };
        rated.push(body);
        return HttpResponse.json({ recipe: { ...stew, rating: body.rating } });
      }),
    );

    const { sheet } = await finishCooking(user);
    const stars = within(sheet).getByRole('group', { name: 'Оценка' });
    expect(
      within(stars).getByRole('button', { name: '3 от 5' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(stars).getByRole('button', { name: '5 от 5' }));

    await vi.waitFor(() => expect(rated).toEqual([{ rating: 5 }]));
    expect(
      within(stars).getByRole('button', { name: '5 от 5' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('dialog', { name: 'Как мина?' }),
    ).toBeInTheDocument();
  });

  it('„Изпрати“ пуска поправка само с указанието и връща, откъдето си влязъл', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    serveRecipe();
    const posts = serveRevisions();

    const { router, sheet } = await finishCooking(user);
    await user.type(
      within(sheet).getByLabelText('Какво да се промени?'),
      `  ${INSTRUCTION} `,
    );
    await user.click(within(sheet).getByRole('button', { name: 'Изпрати' }));

    expect(
      await screen.findByRole('heading', { name: stew.title }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/recipes/${stew.id}`);
    expect(posts).toEqual([{ instruction: INSTRUCTION }]);
  });

  it('„Изпрати“ без указание само връща, без поправка', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    serveRecipe();
    const posts = serveRevisions();

    const { router, sheet } = await finishCooking(user);
    await user.click(within(sheet).getByRole('button', { name: 'Изпрати' }));

    await screen.findByRole('heading', { name: stew.title });
    expect(router.state.location.pathname).toBe(`/recipes/${stew.id}`);
    expect(posts).toEqual([]);
  });

  it('отворена поправка изключва полето и води към нея', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    serveRecipe({ ...stew, openRevision: { id: REVISION_ID, status: 'done' } });

    const { sheet } = await finishCooking(user);

    expect(within(sheet).getByLabelText('Какво да се промени?')).toBeDisabled();
    expect(
      within(sheet).getByRole('link', { name: 'Поправка чака преглед' }),
    ).toHaveAttribute('href', `/recipes/${stew.id}/edit?revise=true`);
    // Оценката остава.
    expect(within(sheet).getByRole('button', { name: '3 от 5' })).toBeEnabled();
  });

  it('поправка, пусната междувременно, изключва полето вместо да излезе', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    serveRecipe();
    server.use(
      http.post(`/api/recipes/${stew.id}/revisions`, () =>
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

    const { router, sheet } = await finishCooking(user);
    const field = within(sheet).getByLabelText('Какво да се промени?');
    await user.type(field, INSTRUCTION);
    await user.click(within(sheet).getByRole('button', { name: 'Изпрати' }));

    expect(
      await within(sheet).findByRole('link', { name: 'Поправка чака преглед' }),
    ).toBeInTheDocument();
    expect(field).toBeDisabled();
    expect(router.state.location.pathname).toBe(`/recipes/${stew.id}/cook`);
  });

  it('без връзка „Изпрати“ е изключено с „Иска връзка“, а „Пропусни“ връща', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    serveRecipe();

    const { router, sheet } = await finishCooking(user);
    const reconnect = goOffline();
    try {
      const send = within(sheet).getByRole('button', { name: 'Изпрати' });
      await vi.waitFor(() => expect(send).toBeDisabled());
      expect(send).toHaveAccessibleDescription('Иска връзка');

      await user.click(within(sheet).getByRole('button', { name: 'Пропусни' }));
      await screen.findByRole('heading', { name: stew.title });
    } finally {
      reconnect();
    }
    expect(router.state.location.pathname).toBe(`/recipes/${stew.id}`);
  });

  it('kiosk без действащ потребител: оценката и поправката минават без потребител', async () => {
    const user = userEvent.setup();
    setUpDevice('kiosk');
    serveRecipe();
    const posts = serveRevisions();
    const actors: (string | null)[] = [];
    server.use(
      http.put(`/api/recipes/${stew.id}/rating`, ({ request }) => {
        actors.push(request.headers.get('X-Acting-User'));
        return HttpResponse.json({ recipe: { ...stew, rating: 4 } });
      }),
    );

    const { router, sheet } = await finishCooking(user);
    await user.click(within(sheet).getByRole('button', { name: '4 от 5' }));
    await vi.waitFor(() => expect(actors).toEqual([null]));
    await user.type(
      within(sheet).getByLabelText('Какво да се промени?'),
      INSTRUCTION,
    );
    await user.click(within(sheet).getByRole('button', { name: 'Изпрати' }));

    await screen.findByRole('heading', { name: stew.title });
    expect(router.state.location.pathname).toBe(`/recipes/${stew.id}`);
    expect(posts).toEqual([{ instruction: INSTRUCTION }]);
  });

  it('kiosk: отворената поправка е текст, без връзка към редакцията', async () => {
    const user = userEvent.setup();
    setUpDevice('kiosk');
    serveRecipe({
      ...stew,
      openRevision: { id: REVISION_ID, status: 'pending' },
    });

    const { sheet } = await finishCooking(user);

    expect(
      within(sheet).getByText('Поправка чака преглед'),
    ).toBeInTheDocument();
    expect(within(sheet).queryByRole('link')).not.toBeInTheDocument();
    expect(within(sheet).getByLabelText('Какво да се промени?')).toBeDisabled();
  });
});
