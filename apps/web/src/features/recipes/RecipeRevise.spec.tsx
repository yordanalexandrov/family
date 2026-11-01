import type {
  Recipe,
  RecipeInput,
  RecipeRevision,
  RecipeRevisionRequest,
  ReplaceRecipeInput,
} from '@family/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { dani, server } from '../../test/msw';
import { goOffline } from '../../test/network';
import { chicken, chickenWithRice, onion, salt } from '../../test/recipes';
import { renderApp, setUpDevice } from '../../test/render';
import { stepPhotoIds } from '../../test/step-photos';

const [ownPhoto] = stepPhotoIds;
const INSTRUCTION = 'пилето иска още 10 минути и никъде не пише черен пипер';

/** A recipe with a photo on its second step. */
const recipe: Recipe = {
  ...chickenWithRice,
  steps: [
    { text: 'Нарежи пилето.' },
    { text: 'Задуши с лука 20 минути.', photoId: ownPhoto },
  ],
};

const revision: RecipeRevision = {
  changes:
    'Задушаването е 30 минути, а черният пипер е добавен като нов продукт.',
  servings: 4,
  prepMinutes: 55,
  ingredients: [
    { ingredient: chicken, quantity: 500, unit: 'g' },
    { ingredient: onion, quantity: 2, unit: 'pcs' },
    { ingredient: salt, quantity: null, unit: 'pinch' },
    {
      newProduct: { name: 'черен пипер', unit: 'g', aisle: 'spices' },
      quantity: null,
      unit: 'pinch',
    },
  ],
  steps: [
    { text: 'Нарежи пилето.' },
    {
      text: 'Задуши с лука 30 минути и поръси с черен пипер.',
      photoId: ownPhoto,
    },
  ],
  preparation: [],
  droppedPhotos: 0,
};

const pending: RecipeRevisionRequest = {
  id: 'dddddddd-0000-4000-8000-000000000001',
  recipeId: recipe.id,
  instruction: INSTRUCTION,
  status: 'pending',
  requestedBy: dani.id,
  createdAt: '2026-11-01T10:00:00.000Z',
};

/**
 * The recipe, its revision (`pending` for the first `pendingPolls` reads, then `finished`), „Отхвърли“ and the save;
 * returns the bodies of `PUT`, of `POST …/revisions` and the ids rejected.
 */
function serveRevise(
  finished: Partial<RecipeRevisionRequest>,
  pendingPolls = 0,
) {
  const saved: ReplaceRecipeInput[] = [];
  const posts: { instruction: string }[] = [];
  const rejected: string[] = [];
  let polls = 0;
  server.use(
    http.get(`/api/recipes/${recipe.id}`, () => HttpResponse.json({ recipe })),
    http.post(`/api/recipes/${recipe.id}/revisions`, async ({ request }) => {
      const body = (await request.json()) as { instruction: string };
      posts.push(body);
      polls = 0;
      return HttpResponse.json(
        { request: { ...pending, instruction: body.instruction } },
        { status: 202 },
      );
    }),
    http.get(`/api/recipes/revisions/${pending.id}`, () => {
      polls += 1;
      return HttpResponse.json({
        request:
          polls <= pendingPolls
            ? pending
            : {
                ...pending,
                finishedAt: '2026-11-01T10:00:40.000Z',
                ...finished,
              },
      });
    }),
    http.post(`/api/recipes/revisions/${pending.id}/reject`, () => {
      rejected.push(pending.id);
      return HttpResponse.json({
        request: {
          ...pending,
          status: 'done',
          revision,
          decision: 'rejected',
        },
      });
    }),
    http.put(`/api/recipes/${recipe.id}`, async ({ request }) => {
      const body = (await request.json()) as ReplaceRecipeInput;
      saved.push(body);
      const { revisionId: _, ...input } = body as RecipeInput & {
        revisionId?: string;
      };
      return HttpResponse.json({ recipe: { ...recipe, ...input } });
    }),
  );
  return { saved, posts, rejected };
}

function listTexts(name: string) {
  return within(screen.getByRole('list', { name }))
    .getAllByRole('listitem')
    .map((item) => item.textContent);
}

async function openEdit() {
  setUpDevice('phone', dani.id);
  renderApp(`/recipes/${recipe.id}/edit`);
  return screen.findByRole('button', { name: '✏️ Поправи с AI' });
}

/** Opens the sheet, writes the instruction and sends it. */
async function send(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await openEdit());
  const sheet = await screen.findByRole('dialog', { name: 'Поправи с AI' });
  await user.type(
    within(sheet).getByLabelText('Какво да се промени?'),
    INSTRUCTION,
  );
  await user.click(within(sheet).getByRole('button', { name: 'Изпрати' }));
  return sheet;
}

describe('„Поправи с AI“ в редакцията', () => {
  it('праща указанието, чака, показва сравнението, а „Приеми“ слага поправката във формата и „Запази“ я праща', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { saved, posts } = serveRevise({ status: 'done', revision }, 1);
    try {
      const sheet = await send(user);

      expect(await within(sheet).findByText('Мисли…')).toBeInTheDocument();
      expect(posts).toEqual([{ instruction: INSTRUCTION }]);
      await vi.advanceTimersByTimeAsync(3_000);
      expect(
        await within(sheet).findByText(revision.changes),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
    const real = userEvent.setup();

    expect(screen.getByText(`Ти написа: ${INSTRUCTION}`)).toBeInTheDocument();
    expect(listTexts('Продукти: сега')).toEqual([
      'пилешко филе · 500 г',
      'лук · 2 бр.',
      'сол · по вкус',
    ]);
    expect(listTexts('Продукти: с поправката')).toEqual([
      'пилешко филе · 500 г',
      'лук · 2 бр.',
      'сол · по вкус',
      'черен пипер · по вкус (нов продукт)',
    ]);
    expect(listTexts('Стъпки: сега')).toEqual([
      'Нарежи пилето.',
      'Задуши с лука 20 минути.',
    ]);
    expect(listTexts('Стъпки: с поправката')).toEqual([
      'Нарежи пилето.',
      'Задуши с лука 30 минути и поръси с черен пипер.',
    ]);
    expect(screen.getByText('4 порции · 45 мин')).toBeInTheDocument();
    expect(screen.getByText('4 порции · 55 мин')).toBeInTheDocument();

    await real.click(screen.getByRole('button', { name: 'Приеми' }));

    expect(
      screen.queryByRole('dialog', { name: 'Поправи с AI' }),
    ).not.toBeInTheDocument();
    expect(listTexts('Стъпки')).toEqual(
      revision.steps.map((step) => step.text),
    );
    expect(screen.getByLabelText('Време (мин)')).toHaveValue('55');
    expect(
      screen.getByRole('button', { name: 'Свържи „черен пипер“' }),
    ).toBeInTheDocument();
    expect(saved).toEqual([]);

    // Новият продукт се свързва преди запис; махнат, рецептата се записва с поправката.
    await real.click(
      screen.getByRole('button', { name: 'черен пипер · по вкус' }),
    );
    await real.click(screen.getByRole('button', { name: 'Премахни ред' }));
    await real.click(screen.getByRole('button', { name: 'Запази' }));

    await vi.waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]?.revisionId).toBe(pending.id);
    expect(saved[0]?.steps).toEqual(revision.steps);
    expect(saved[0]?.prepMinutes).toBe(55);
  });

  it('„Отхвърли“ отхвърля поправката и не пипа формата', async () => {
    const user = userEvent.setup();
    const { rejected, saved } = serveRevise({ status: 'done', revision });
    await send(user);

    await user.click(await screen.findByRole('button', { name: 'Отхвърли' }));

    await vi.waitFor(() => expect(rejected).toEqual([pending.id]));
    expect(
      screen.queryByRole('dialog', { name: 'Поправи с AI' }),
    ).not.toBeInTheDocument();
    expect(listTexts('Стъпки')).toEqual([
      'Нарежи пилето.',
      'Задуши с лука 20 минути.',
    ]);
    await user.click(screen.getByRole('button', { name: 'Запази' }));
    await vi.waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]?.revisionId).toBeUndefined();
  });

  it('брои снимките, които отпадат', async () => {
    const user = userEvent.setup();
    serveRevise({
      status: 'done',
      revision: {
        ...revision,
        steps: [{ text: 'Сготви всичко.' }],
        droppedPhotos: 1,
      },
    });
    await send(user);

    expect(await screen.findByText('1 снимка отпада.')).toBeInTheDocument();
  });

  it('затворен, докато AI мисли, и отворен пак продължава същата поправка', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { posts } = serveRevise({ status: 'done', revision }, 1);
    try {
      const sheet = await send(user);
      await within(sheet).findByText('Мисли…');
      await user.click(within(sheet).getByRole('button', { name: 'Затвори' }));
      await user.click(screen.getByRole('button', { name: '✏️ Поправи с AI' }));
      await vi.advanceTimersByTimeAsync(3_000);

      expect(await screen.findByText(revision.changes)).toBeInTheDocument();
      expect(posts).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('без какво да поправи казва причината', async () => {
    const user = userEvent.setup();
    serveRevise({
      status: 'failed',
      error: 'no_results',
      noResults: 'Указанието не е за тази рецепта.',
    });
    await send(user);

    expect(
      await screen.findByText(
        'Няма какво да се поправи. Указанието не е за тази рецепта.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Приеми' }),
    ).not.toBeInTheDocument();
  });

  it('при неуспех казва защо, а „Опитай пак“ праща същото указание', async () => {
    const user = userEvent.setup();
    const { posts } = serveRevise({
      status: 'failed',
      error: 'invalid_output',
    });
    await send(user);

    await screen.findByText(
      'AI върна отговор, който не мога да прочета. Опитай пак.',
    );
    await user.click(screen.getByRole('button', { name: 'Опитай пак' }));

    await vi.waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1]).toEqual({ instruction: INSTRUCTION });
  });

  it('без връзка „Изпрати“ е изключено и казва „Иска връзка“', async () => {
    const user = userEvent.setup();
    serveRevise({ status: 'done', revision });
    await user.click(await openEdit());
    const sheet = await screen.findByRole('dialog', { name: 'Поправи с AI' });
    await user.type(
      within(sheet).getByLabelText('Какво да се промени?'),
      INSTRUCTION,
    );
    const reconnect = goOffline();
    try {
      const button = within(sheet).getByRole('button', { name: 'Изпрати' });
      await vi.waitFor(() => expect(button).toBeDisabled());
      expect(button).toHaveAccessibleDescription('Иска връзка');
    } finally {
      reconnect();
    }
  });
});
