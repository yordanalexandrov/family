import type {
  Recipe,
  RecipeInput,
  RecipeRefinement,
  RecipeRefineRequest,
} from '@family/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { dani, server } from '../../test/msw';
import { goOffline } from '../../test/network';
import { chickenWithRice } from '../../test/recipes';
import { renderApp, setUpDevice } from '../../test/render';
import { stepPhotoIds } from '../../test/step-photos';

const [ownPhoto, pagePhoto] = stepPhotoIds;

/** A recipe with terse steps, no time, and a photo on its second step. */
const recipe: Recipe = {
  ...chickenWithRice,
  prepMinutes: undefined,
  steps: [
    { text: 'Нарежи пилето.' },
    { text: 'Задуши с лука.', photoId: ownPhoto },
  ],
};

const refinement: RecipeRefinement = {
  steps: [
    {
      text: 'Нарежи 500 г пилешко филе на кубчета около 2 см.',
      photoId: pagePhoto,
    },
    {
      text: 'Задуши пилето с 2 глави лук на среден огън под капак 20 минути, докато месото побелее.',
      photoId: ownPhoto,
    },
    { text: 'Посоли на вкус и сервирай.' },
  ],
  prepMinutes: 40,
  changes: 'Стъпките са по-подробни, а времето е от източника.',
  source: 'read',
  droppedPhotos: 0,
};

const pending: RecipeRefineRequest = {
  id: 'cccccccc-0000-4000-8000-000000000001',
  recipeId: recipe.id,
  status: 'pending',
  requestedBy: dani.id,
  createdAt: '2026-10-31T10:00:00.000Z',
};

/**
 * The recipe, its refinement (`pending` for the first `pendingPolls` reads, then `finished`) and its save; returns the
 * bodies of `PUT` and the calls of `POST …/refinements`.
 */
function serveRefine(finished: Partial<RecipeRefineRequest>, pendingPolls = 0) {
  const saved: RecipeInput[] = [];
  const posts: string[] = [];
  let polls = 0;
  server.use(
    http.get(`/api/recipes/${recipe.id}`, () => HttpResponse.json({ recipe })),
    http.post(`/api/recipes/${recipe.id}/refinements`, () => {
      posts.push(recipe.id);
      return HttpResponse.json({ request: pending }, { status: 202 });
    }),
    http.get(`/api/recipes/refinements/${pending.id}`, () => {
      polls += 1;
      return HttpResponse.json({
        request:
          polls <= pendingPolls
            ? pending
            : {
                ...pending,
                finishedAt: '2026-10-31T10:00:40.000Z',
                ...finished,
              },
      });
    }),
    http.put(`/api/recipes/${recipe.id}`, async ({ request }) => {
      const body = (await request.json()) as RecipeInput;
      saved.push(body);
      return HttpResponse.json({ recipe: { ...recipe, ...body } });
    }),
  );
  return { saved, posts };
}

function stepTexts(name: string) {
  return within(screen.getByRole('list', { name }))
    .getAllByRole('listitem')
    .map((item) => item.textContent);
}

async function openEdit() {
  setUpDevice('phone', dani.id);
  renderApp(`/recipes/${recipe.id}/edit`);
  return screen.findByRole('button', { name: '✨ Подобри рецептата' });
}

describe('„Подобри рецептата“ в редакцията', () => {
  it('показва сегашните и предложените стъпки, а „Приеми“ ги слага във формата и „Запази“ ги праща', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { saved } = serveRefine({ status: 'done', refinement }, 1);
    try {
      await user.click(await openEdit());

      const sheet = await screen.findByRole('dialog', {
        name: 'Подобри рецептата',
      });
      expect(await within(sheet).findByText('Мисля…')).toBeInTheDocument();
      await vi.advanceTimersByTimeAsync(3_000);
      expect(
        await within(sheet).findByText(refinement.changes),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
    const real = userEvent.setup();

    expect(stepTexts('Сега')).toEqual(['Нарежи пилето.', 'Задуши с лука.']);
    expect(stepTexts('Предложение')).toEqual(
      refinement.steps.map((step) => step.text),
    );
    expect(screen.getByText('Време: 40 мин')).toBeInTheDocument();

    await real.click(screen.getByRole('button', { name: 'Приеми' }));

    expect(
      screen.queryByRole('dialog', { name: 'Подобри рецептата' }),
    ).not.toBeInTheDocument();
    expect(stepTexts('Стъпки')).toEqual(
      refinement.steps.map((step) => step.text),
    );
    expect(screen.getByLabelText('Време (мин)')).toHaveValue('40');
    expect(saved).toEqual([]);

    await real.click(screen.getByRole('button', { name: 'Запази' }));

    await vi.waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]?.steps).toEqual(refinement.steps);
    expect(saved[0]?.prepMinutes).toBe(40);
  });

  it('„Откажи“ в прегледа не променя формата', async () => {
    const user = userEvent.setup();
    serveRefine({ status: 'done', refinement });
    await user.click(await openEdit());

    await user.click(await screen.findByRole('button', { name: 'Откажи' }));

    expect(stepTexts('Стъпки')).toEqual(['Нарежи пилето.', 'Задуши с лука.']);
  });

  it('казва, че източникът не се е отворил и колко снимки не са се свалили', async () => {
    const user = userEvent.setup();
    serveRefine({
      status: 'done',
      refinement: { ...refinement, source: 'unread', droppedPhotos: 2 },
    });
    await user.click(await openEdit());

    expect(
      await screen.findByText('Източникът не се отвори — без нови снимки.'),
    ).toBeInTheDocument();
    expect(screen.getByText('2 снимки не се свалиха.')).toBeInTheDocument();
  });

  it('без нищо за подобряване казва „Рецептата вече е наред“ с причината', async () => {
    const user = userEvent.setup();
    serveRefine({
      status: 'failed',
      error: 'no_results',
      noResults: 'Стъпките вече са подробни.',
    });
    await user.click(await openEdit());

    expect(
      await screen.findByText(
        'Рецептата вече е наред. Стъпките вече са подробни.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Приеми' }),
    ).not.toBeInTheDocument();
  });

  it('при невалиден отговор казва, че не е успяло, и предлага „Опитай пак“', async () => {
    const user = userEvent.setup();
    const { posts } = serveRefine({
      status: 'failed',
      error: 'invalid_output',
    });
    await user.click(await openEdit());

    await screen.findByText(
      'AI върна отговор, който не мога да прочета. Опитай пак.',
    );
    await user.click(screen.getByRole('button', { name: 'Опитай пак' }));

    expect(posts).toHaveLength(2);
  });

  it('затворен, докато чака, и отворен пак продължава същата заявка, без нова', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { posts } = serveRefine({ status: 'done', refinement }, 1);
    try {
      const button = await openEdit();
      await user.click(button);
      const sheet = await screen.findByRole('dialog', {
        name: 'Подобри рецептата',
      });
      await within(sheet).findByText('Мисля…');
      await user.click(within(sheet).getByRole('button', { name: 'Затвори' }));
      await user.click(button);
      await vi.advanceTimersByTimeAsync(3_000);

      expect(await screen.findByText(refinement.changes)).toBeInTheDocument();
      expect(posts).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('без връзка бутонът е изключен и казва „Иска връзка“', async () => {
    serveRefine({ status: 'done', refinement });
    const button = await openEdit();
    const reconnect = goOffline();
    try {
      await vi.waitFor(() => expect(button).toBeDisabled());
      expect(button).toHaveAccessibleDescription('Иска връзка');
    } finally {
      reconnect();
    }
  });
});
