import { type MealReplaceRequest, systemLine } from '@family/shared';
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
  serveThreads,
  showPastDays,
  thisWeek,
  threadLine,
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
 * `POST /api/menu/meals/:id/replacements` → 202, а `GET /api/menu/replacements/:id` и последната заявка на ястието
 * (`GET /api/menu/meals/:id/replacements`) с поредните състояния (последното се повтаря). Последната заявка е 404
 * преди първия `POST`, освен ако `asked` казва, че вече е поискана. Връща броя на `POST`-овете.
 */
function serveReplacement(
  states: MealReplaceRequest[],
  { asked = false }: { asked?: boolean } = {},
) {
  let posts = 0;
  let gets = 0;
  const next = () => {
    const replacement = states[Math.min(gets, states.length - 1)];
    gets += 1;
    return HttpResponse.json({ replacement });
  };
  server.use(
    http.post('/api/menu/meals/:id/replacements', () => {
      posts += 1;
      gets = 0;
      return HttpResponse.json({ replacement: states[0] }, { status: 202 });
    }),
    http.get(`/api/menu/replacements/${replacementId}`, next),
    http.get('/api/menu/meals/:id/replacements', () =>
      asked || posts > 0
        ? next()
        : HttpResponse.json(
            {
              error: 'not_found',
              code: 'no_replacement',
              message: 'Никой не е търсил друго ястие',
            },
            { status: 404 },
          ),
    ),
  );
  return () => posts;
}

/** `reopen`: the past days are already unfolded from the first opening. */
async function openSheet(title: RegExp, name: string, { reopen = false } = {}) {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  await screen.findByRole('list', { name: 'Вечери' });
  if (!reopen) await showPastDays(user);
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
    serveReplacement([pending(thursday), pending(thursday), done(thursday)]);
    const patches = serveMealUpdates(week);

    renderApp('/menu');
    const { user, sheet } = await openSheet(/Мусака/, 'четвъртък, 5 ноември');
    await user.click(
      within(sheet).getByRole('button', { name: '✨ Предложи друго' }),
    );

    expect(await within(sheet).findByText('Мисля…')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(within(sheet).getByText('Мисля…')).toBeInTheDocument();
    // `done` идва с третото питане; дали има и едно веднага след `POST`, зависи от реда на рендерите.
    await act(() => vi.advanceTimersByTimeAsync(3000));
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
    const posts = serveReplacement([
      pending(thursday),
      {
        ...pending(thursday),
        status: 'failed',
        error: 'timeout',
        finishedAt: '2026-11-04T08:03:00.000Z',
      },
    ]);

    renderApp('/menu');
    const { user, sheet } = await openSheet(/Мусака/, 'четвъртък, 5 ноември');
    await user.click(
      within(sheet).getByRole('button', { name: '✨ Предложи друго' }),
    );
    await act(() => vi.advanceTimersByTimeAsync(3000));
    await act(() => vi.advanceTimersByTimeAsync(3000));

    expect(await within(sheet).findByRole('alert')).toHaveTextContent(
      'AI не отговори за 3 минути. Опитай пак или избери сам.',
    );
    await user.click(within(sheet).getByRole('button', { name: 'Опитай пак' }));

    expect(await within(sheet).findByText('Мисля…')).toBeInTheDocument();
    expect(posts()).toBe(2);
  });

  it('затворен и отворен пак по време на pending, листът пак мисли, а после показва кандидатите', async () => {
    const week = plan();
    const thursday = week.meals[3]?.id ?? '';
    servePlans({ [thisWeek]: week });
    serveDinnerRecipes();
    serveReplacement([pending(thursday), pending(thursday), done(thursday)]);

    renderApp('/menu');
    const first = await openSheet(/Мусака/, 'четвъртък, 5 ноември');
    await first.user.click(
      within(first.sheet).getByRole('button', { name: '✨ Предложи друго' }),
    );
    expect(await within(first.sheet).findByText('Мисля…')).toBeInTheDocument();
    await first.user.click(
      within(first.sheet).getByRole('button', { name: 'Готово' }),
    );
    await expect.poll(() => screen.queryByRole('dialog')).toBeNull();

    const { sheet } = await openSheet(/Мусака/, 'четвъртък, 5 ноември', {
      reopen: true,
    });

    expect(await within(sheet).findByText('Мисля…')).toBeInTheDocument();
    expect(
      within(sheet).queryByRole('button', { name: '✨ Предложи друго' }),
    ).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(3000));
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(
      await within(sheet).findByRole('list', { name: 'Предложения' }),
    ).toBeInTheDocument();
  });

  it('при отваряне показва кандидатите на по-ранна заявка, докато ястието не е сменено след нея', async () => {
    const week = plan();
    const thursday = week.meals[3]?.id ?? '';
    servePlans({ [thisWeek]: week });
    serveDinnerRecipes();
    serveReplacement([done(thursday)], { asked: true });

    renderApp('/menu');
    const { sheet } = await openSheet(/Мусака/, 'четвъртък, 5 ноември');

    const list = await within(sheet).findByRole('list', {
      name: 'Предложения',
    });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(
      within(sheet).queryByRole('button', { name: '✨ Предложи друго' }),
    ).toBeNull();
  });

  it('ястие, сменено след заявката, не показва старите ѝ кандидати', async () => {
    const week = plan();
    const thursday = week.meals[3]?.id ?? '';
    servePlans({ [thisWeek]: week });
    serveDinnerRecipes();
    serveThreads(week, {
      [thursday]: [
        threadLine(thursday, 1, {
          kind: 'system',
          body: 'смени „Леща чорба“ → „Мусака“',
        }),
      ],
    });
    serveReplacement([done(thursday)], { asked: true });

    renderApp('/menu');
    const { sheet } = await openSheet(/Мусака/, 'четвъртък, 5 ноември');

    expect(
      await within(sheet).findByRole('button', { name: '✨ Предложи друго' }),
    ).toBeInTheDocument();
    expect(
      within(sheet).queryByRole('list', { name: 'Предложения' }),
    ).toBeNull();
  });

  it('ястие, преместено на друг ден след заявката, пак показва кандидатите ѝ', async () => {
    const week = plan();
    const thursday = week.meals[3]?.id ?? '';
    servePlans({ [thisWeek]: week });
    serveDinnerRecipes();
    serveThreads(week, {
      [thursday]: [
        threadLine(thursday, 1, {
          kind: 'system',
          body: systemLine({
            type: 'swapped',
            date: '2026-11-04',
            otherDate: '2026-11-05',
          }),
        }),
      ],
    });
    serveReplacement([done(thursday)], { asked: true });

    renderApp('/menu');
    const { sheet } = await openSheet(/Мусака/, 'четвъртък, 5 ноември');

    const list = await within(sheet).findByRole('list', {
      name: 'Предложения',
    });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  });

  it('при отваряне показва грешката на последната заявка и „Опитай пак“', async () => {
    const week = plan();
    const thursday = week.meals[3]?.id ?? '';
    servePlans({ [thisWeek]: week });
    serveDinnerRecipes();
    serveReplacement(
      [
        {
          ...pending(thursday),
          status: 'failed',
          error: 'timeout',
          finishedAt: '2026-11-04T08:03:00.000Z',
        },
      ],
      { asked: true },
    );

    renderApp('/menu');
    const { sheet } = await openSheet(/Мусака/, 'четвъртък, 5 ноември');

    expect(await within(sheet).findByRole('alert')).toBeInTheDocument();
    expect(
      within(sheet).getByRole('button', { name: 'Опитай пак' }),
    ).toBeInTheDocument();
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

describe('MealSheet: „Махни ястието от деня“', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(fixtureNow);
    setUpDevice('phone', dani.id);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('„Без рецепта“ не е сред резултатите, а отделен бутон под тях; махането показва toast с „Върни“, което връща рецептата', async () => {
    const week = planFor(thisWeek, {
      3: {
        recipeId: moussaka.id,
        recipe: { title: moussaka.title, archivedAt: null, rating: null },
        why: 'Мусака за четвъртък.',
      },
    });
    const thursday = week.meals[3]?.id ?? '';
    servePlans({ [thisWeek]: week });
    serveDinnerRecipes();
    const patches = serveMealUpdates(week);

    renderApp('/menu');
    const { user, sheet } = await openSheet(/Мусака/, 'четвъртък, 5 ноември');
    await user.click(within(sheet).getByRole('button', { name: 'Избери сам' }));
    const results = await within(sheet).findByRole('list', {
      name: 'Вечерни рецепти',
    });
    await within(results).findByRole('button', { name: /Мусака/ });
    expect(
      within(results).queryByRole('button', { name: /Без рецепта|Махни/ }),
    ).toBeNull();

    await user.click(
      within(sheet).getByRole('button', { name: 'Махни ястието от деня' }),
    );

    await expect
      .poll(() => patches)
      .toEqual([{ id: thursday, body: { recipeId: null } }]);
    expect(
      await screen.findByText('„Мусака“ е махнато от четвъртък'),
    ).toBeInTheDocument();
    expect(
      within(sheet).queryByRole('button', { name: 'Махни ястието от деня' }),
    ).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Върни' }));

    await expect
      .poll(() => patches.at(-1))
      .toEqual({
        id: thursday,
        body: { recipeId: moussaka.id, why: 'Мусака за четвъртък.' },
      });
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));
    expect(
      await screen.findByRole('button', { name: /Мусака/ }),
    ).toHaveTextContent('чт');
  });

  it('„Върни“ остава и след затварянето на листа', async () => {
    const week = planFor(thisWeek, {
      3: {
        recipeId: moussaka.id,
        recipe: { title: moussaka.title, archivedAt: null, rating: null },
      },
    });
    const thursday = week.meals[3]?.id ?? '';
    servePlans({ [thisWeek]: week });
    serveDinnerRecipes();
    const patches = serveMealUpdates(week);

    renderApp('/menu');
    const { user, sheet } = await openSheet(/Мусака/, 'четвъртък, 5 ноември');
    await user.click(within(sheet).getByRole('button', { name: 'Избери сам' }));
    await user.click(
      within(sheet).getByRole('button', { name: 'Махни ястието от деня' }),
    );
    await screen.findByText('„Мусака“ е махнато от четвъртък');

    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Върни' }));

    await expect
      .poll(() => patches.at(-1))
      .toEqual({ id: thursday, body: { recipeId: moussaka.id } });
  });

  it('празен ден е без „Махни ястието от деня“', async () => {
    servePlans({ [thisWeek]: plan() });
    serveDinnerRecipes();

    renderApp('/menu');
    const { user, sheet } = await openSheet(/пт/, 'петък, 6 ноември');
    await user.click(within(sheet).getByRole('button', { name: 'Избери сам' }));
    await within(sheet).findByRole('list', { name: 'Вечерни рецепти' });

    expect(
      within(sheet).queryByRole('button', { name: 'Махни ястието от деня' }),
    ).toBeNull();
  });
});
