import type { MealReplaceRequest } from '@family/shared';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dinnerRecipes,
  planFor,
  serveDinnerRecipes,
  serveMealUpdates,
  servePlans,
  showPastDays,
  thisWeek,
} from '../../test/menu';
import { dani, fixtureNow, server } from '../../test/msw';
import { renderApp, setUpDevice } from '../../test/render';

const [chicken, lentils, moussaka, fish] = dinnerRecipes;

const replacementId = 'dddddddd-0000-4000-8000-000000000001';

/** Четвъртък (от днес нататък) с мусака; понеделник е минал и е с пиле. */
function plan() {
  return planFor(thisWeek, {
    0: {
      recipeId: chicken.id,
      recipe: { title: chicken.title, archivedAt: null, rating: null },
    },
    3: {
      recipeId: moussaka.id,
      recipe: { title: moussaka.title, archivedAt: null, rating: null },
    },
  });
}

function pending(mealId: string): MealReplaceRequest {
  return {
    id: replacementId,
    mealId,
    status: 'pending',
    requestedBy: dani.id,
    createdAt: '2026-11-04T08:00:00.000Z',
  };
}

function done(mealId: string): MealReplaceRequest {
  return {
    ...pending(mealId),
    status: 'done',
    finishedAt: '2026-11-04T08:00:30.000Z',
    candidates: [
      {
        recipeId: lentils.id,
        why: 'Без месо, както пита Поли.',
        title: lentils.title,
        prepMinutes: 45,
      },
      {
        recipeId: fish.id,
        why: 'Риба за разнообразие след мусаката.',
        title: fish.title,
      },
    ],
  };
}

/**
 * `POST /api/menu/meals/:id/replacements` → 202 и `GET /api/menu/replacements/:id` с поредните състояния (последното
 * се повтаря). Връща броя на `POST`-овете.
 */
function serveReplacement(...states: MealReplaceRequest[]) {
  let posts = 0;
  let gets = 0;
  server.use(
    http.post('/api/menu/meals/:id/replacements', () => {
      posts += 1;
      gets = 0;
      return HttpResponse.json({ replacement: states[0] }, { status: 202 });
    }),
    http.get(`/api/menu/replacements/${replacementId}`, () => {
      const replacement = states[Math.min(gets, states.length - 1)];
      gets += 1;
      return HttpResponse.json({ replacement });
    }),
  );
  return () => posts;
}

async function openSheet(title: RegExp, name: string) {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  await screen.findByRole('list', { name: 'Вечери' });
  await showPastDays(user);
  await user.click(await screen.findByRole('button', { name: title }));
  return { user, sheet: screen.getByRole('dialog', { name }) };
}

describe('MealSheet: „✨ Предложи друго“', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(fixtureNow);
    setUpDevice('phone', dani.id);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('мисли, докато заявката е pending, после показва кандидатите; изборът сменя ястието с неговото „защо“', async () => {
    const week = plan();
    const thursday = week.meals[3]?.id ?? '';
    servePlans({ [thisWeek]: week });
    serveDinnerRecipes();
    serveReplacement(pending(thursday), pending(thursday), done(thursday));
    const patches = serveMealUpdates(week);

    renderApp('/menu');
    const { user, sheet } = await openSheet(/Мусака/, 'четвъртък, 5 ноември');
    await user.click(
      within(sheet).getByRole('button', { name: '✨ Предложи друго' }),
    );

    expect(await within(sheet).findByText('Мисля…')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(within(sheet).getByText('Мисля…')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(3000));

    const list = await within(sheet).findByRole('list', {
      name: 'Предложения',
    });
    const cards = within(list).getAllByRole('listitem');
    expect(cards.map((card) => card.textContent)).toEqual([
      expect.stringMatching(/Леща чорба.*45 мин.*Без месо, както пита Поли\./),
      expect.stringMatching(/Риба на фурна.*Риба за разнообразие/),
    ]);
    expect(
      within(sheet).getByRole('link', {
        name: 'Нищо не става? Поискай нови рецепти',
      }),
    ).toHaveAttribute('href', '/recipes/suggest');
    expect(within(sheet).queryByText('Мисля…')).toBeNull();

    await user.click(
      within(list).getByRole('button', { name: 'Избери „Леща чорба“' }),
    );

    await expect
      .poll(() => patches)
      .toEqual([
        {
          id: thursday,
          body: { recipeId: lentils.id, why: 'Без месо, както пита Поли.' },
        },
      ]);
    await expect
      .poll(() => within(sheet).queryByRole('list', { name: 'Предложения' }))
      .toBeNull();
  });

  it('при failed казва защо и „Опитай пак“ пуска нова заявка', async () => {
    const week = plan();
    const thursday = week.meals[3]?.id ?? '';
    servePlans({ [thisWeek]: week });
    serveDinnerRecipes();
    const posts = serveReplacement(pending(thursday), {
      ...pending(thursday),
      status: 'failed',
      error: 'timeout',
      finishedAt: '2026-11-04T08:03:00.000Z',
    });

    renderApp('/menu');
    const { user, sheet } = await openSheet(/Мусака/, 'четвъртък, 5 ноември');
    await user.click(
      within(sheet).getByRole('button', { name: '✨ Предложи друго' }),
    );
    await act(() => vi.advanceTimersByTimeAsync(3000));

    expect(await within(sheet).findByRole('alert')).toHaveTextContent(
      'Не успях навреме, опитай пак',
    );
    await user.click(within(sheet).getByRole('button', { name: 'Опитай пак' }));

    expect(await within(sheet).findByText('Мисля…')).toBeInTheDocument();
    expect(posts()).toBe(2);
  });

  it('при 409 от api показва съобщението му', async () => {
    const week = plan();
    servePlans({ [thisWeek]: week });
    serveDinnerRecipes();
    server.use(
      http.post('/api/menu/meals/:id/replacements', () =>
        HttpResponse.json(
          {
            error: 'conflict',
            code: 'not_enough_recipes',
            message: 'За друго ястие трябват поне 3 други рецепти',
            have: 2,
            need: 3,
          },
          { status: 409 },
        ),
      ),
    );

    renderApp('/menu');
    const { user, sheet } = await openSheet(/Мусака/, 'четвъртък, 5 ноември');
    await user.click(
      within(sheet).getByRole('button', { name: '✨ Предложи друго' }),
    );

    expect(await within(sheet).findByRole('alert')).toHaveTextContent(
      'За друго ястие трябват поне 3 други рецепти',
    );
  });

  it('на минал ден го няма', async () => {
    servePlans({ [thisWeek]: plan() });
    serveDinnerRecipes();

    renderApp('/menu');
    const { sheet } = await openSheet(/Пиле с ориз/, 'понеделник, 2 ноември');

    expect(
      within(sheet).queryByRole('button', { name: '✨ Предложи друго' }),
    ).toBeNull();
  });
});
