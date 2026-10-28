import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dinnerRecipes,
  lastWeek,
  planFor,
  serveDinnerRecipes,
  serveMealUpdates,
  servePlans,
  serveThreads,
  showPastDays,
  thisWeek,
  threadLine,
} from '../../test/menu';
import { dani, fixtureNow, poli } from '../../test/msw';
import { renderApp, setUpDevice } from '../../test/render';

const [chicken, , moussaka] = dinnerRecipes;

/**
 * Четвъртък (от днес нататък) с мусака и разговор: Поли пита, Дани сменя и отговаря. Понеделник е минал и има
 * един коментар.
 */
function planWithThread(weekStart = thisWeek) {
  const plan = planFor(weekStart, {
    0: {
      recipeId: chicken.id,
      recipe: { title: chicken.title, archivedAt: null, rating: null },
    },
    3: {
      recipeId: moussaka.id,
      recipe: { title: moussaka.title, archivedAt: null, rating: null },
    },
  });
  const thursday = plan.meals[3]?.id ?? '';
  const monday = plan.meals[0]?.id ?? '';
  const threads = {
    [thursday]: [
      threadLine(thursday, 1, { authorUserId: poli.id, body: 'пак пиле?' }),
      threadLine(thursday, 2, {
        kind: 'system',
        body: 'смени „Пиле с ориз“ → „Мусака“',
      }),
      threadLine(thursday, 3, { body: 'така по-добре' }),
    ],
    [monday]: [threadLine(monday, 4, { body: 'беше вкусно' })],
  };
  plan.meals = plan.meals.map((meal) => {
    const lines = threads[meal.id];
    return lines
      ? { ...meal, commentCount: lines.length, lastComment: lines.at(-1) }
      : meal;
  });
  return { plan, threads, thursday };
}

async function openSheet(title: RegExp, name: string) {
  const user = userEvent.setup();
  await screen.findByRole('list', { name: 'Вечери' });
  await showPastDays(user);
  await user.click(await screen.findByRole('button', { name: title }));
  return { user, sheet: screen.getByRole('dialog', { name }) };
}

describe('MealSheet: разговор', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(fixtureNow);
    setUpDevice('phone', dani.id);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('редът показва последния ред от разговора и броя редове', async () => {
    const { plan } = planWithThread();
    servePlans({ [thisWeek]: plan });

    renderApp('/menu');

    const row = await screen.findByRole('button', { name: /Мусака/ });
    expect(row).toHaveTextContent('Дани: така по-добре');
    expect(row).toHaveTextContent('3 в разговора');
  });

  it('листът показва разговора по ред: коментарите с автор и час, системните редове с името отпред', async () => {
    const { plan, threads } = planWithThread();
    servePlans({ [thisWeek]: plan });
    serveDinnerRecipes();
    serveThreads(plan, threads);

    renderApp('/menu');
    const { sheet } = await openSheet(/Мусака/, 'четвъртък, 5 ноември');

    const thread = within(sheet).getByRole('list', { name: 'Разговор' });
    const lines = await within(thread).findAllByRole('listitem');
    expect(lines.map((line) => line.textContent)).toEqual([
      expect.stringMatching(/Поли.*17:01.*пак пиле\?/),
      expect.stringMatching(/Дани смени „Пиле с ориз“ → „Мусака“/),
      expect.stringMatching(/Дани.*17:03.*така по-добре/),
    ]);
  });

  it('коментар се добавя в разговора и в реда', async () => {
    const { plan, threads } = planWithThread();
    servePlans({ [thisWeek]: plan });
    serveDinnerRecipes();
    const requests = serveThreads(plan, threads);

    renderApp('/menu');
    const { user, sheet } = await openSheet(/Мусака/, 'четвъртък, 5 ноември');
    await user.type(
      within(sheet).getByRole('textbox', { name: 'Коментар' }),
      'и салата',
    );
    await user.click(within(sheet).getByRole('button', { name: 'Изпрати' }));

    const thread = within(sheet).getByRole('list', { name: 'Разговор' });
    expect(await within(thread).findByText('и салата')).toBeInTheDocument();
    expect(
      within(sheet).getByRole('textbox', { name: 'Коментар' }),
    ).toHaveValue('');
    expect(requests.filter((r) => r.method === 'POST')).toEqual([
      {
        method: 'POST',
        path: `/api/menu/meals/${plan.meals[3]?.id}/comments`,
        body: { body: 'и салата' },
      },
    ]);
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));
    await expect
      .poll(() => screen.getByRole('button', { name: /Мусака/ }).textContent)
      .toContain('Дани: и салата');
  });

  it('свой коментар се трие; чужд и системен ред нямат „Изтрий“', async () => {
    const { plan, threads } = planWithThread();
    servePlans({ [thisWeek]: plan });
    serveDinnerRecipes();
    const requests = serveThreads(plan, threads);

    renderApp('/menu');
    const { user, sheet } = await openSheet(/Мусака/, 'четвъртък, 5 ноември');
    const thread = within(sheet).getByRole('list', { name: 'Разговор' });
    await within(thread).findByText('така по-добре');

    const remove = within(thread).getAllByRole('button', {
      name: 'Изтрий коментара',
    });
    expect(remove).toHaveLength(1);
    await user.click(remove[0] as HTMLElement);

    await expect
      .poll(() => within(thread).queryByText('така по-добре'))
      .toBeNull();
    expect(within(thread).getByText('пак пиле?')).toBeInTheDocument();
    const mine = threadLine(plan.meals[3]?.id ?? '', 3);
    expect(requests.filter((r) => r.method === 'DELETE')).toEqual([
      { method: 'DELETE', path: `/api/menu/comments/${mine.id}` },
    ]);
  });

  it('на минал ден разговорът се чете, но не се пише', async () => {
    const { plan, threads } = planWithThread();
    servePlans({ [thisWeek]: plan });
    serveDinnerRecipes();
    serveThreads(plan, threads);

    renderApp('/menu');
    const { sheet } = await openSheet(/Пиле с ориз/, 'понеделник, 2 ноември');

    const thread = within(sheet).getByRole('list', { name: 'Разговор' });
    expect(await within(thread).findByText('беше вкусно')).toBeInTheDocument();
    expect(
      within(sheet).queryByRole('textbox', { name: 'Коментар' }),
    ).toBeNull();
    expect(
      within(thread).queryByRole('button', { name: 'Изтрий коментара' }),
    ).toBeNull();
  });

  it('„Избери сам“ отваря избора от регистъра', async () => {
    const { plan, threads } = planWithThread();
    servePlans({ [thisWeek]: plan });
    serveDinnerRecipes();
    serveThreads(plan, threads);
    const patches = serveMealUpdates(plan);

    renderApp('/menu');
    const { user, sheet } = await openSheet(/Мусака/, 'четвъртък, 5 ноември');
    expect(
      within(sheet).queryByRole('searchbox', { name: 'Търси рецепта' }),
    ).toBeNull();

    await user.click(within(sheet).getByRole('button', { name: 'Избери сам' }));
    await user.click(
      await within(sheet).findByRole('button', { name: /^Пиле с ориз/ }),
    );

    await expect
      .poll(() => patches)
      .toEqual([{ id: plan.meals[3]?.id, body: { recipeId: chicken.id } }]);
  });
});

describe('MealSheet: разговор в минала седмица', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(fixtureNow);
    setUpDevice('phone', dani.id);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('листът се отваря само за четене: разговорът се вижда, без глас, коментар, смяна и размяна', async () => {
    const { plan, threads } = planWithThread(lastWeek);
    servePlans({ [thisWeek]: planFor(thisWeek), [lastWeek]: plan });
    serveDinnerRecipes();
    serveThreads(plan, threads);

    renderApp('/menu');
    const user = userEvent.setup();
    await screen.findByRole('list', { name: 'Вечери' });
    await user.click(screen.getByRole('button', { name: 'Предишна седмица' }));
    await user.click(await screen.findByRole('button', { name: /Мусака/ }));
    const sheet = screen.getByRole('dialog', {
      name: 'четвъртък, 29 октомври',
    });

    const thread = within(sheet).getByRole('list', { name: 'Разговор' });
    expect(
      await within(thread).findByText('така по-добре'),
    ).toBeInTheDocument();
    expect(
      within(thread).queryByRole('button', { name: 'Изтрий коментара' }),
    ).toBeNull();
    for (const name of [
      'За',
      'Против',
      'Изпрати',
      'Избери сам',
      '✨ Предложи друго',
      'Премести на…',
      'Поли',
      'никой',
      'Повече порции за Дани',
    ]) {
      expect(within(sheet).queryByRole('button', { name })).toBeNull();
    }
    expect(
      within(sheet).queryByRole('textbox', { name: 'Коментар' }),
    ).toBeNull();
    expect(
      within(sheet).queryByRole('textbox', { name: 'Бележка' }),
    ).toBeNull();
  });
});

describe.each(['kiosk', 'tv'] as const)(
  'MenuWeek на %s: без разговор',
  (mode) => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(fixtureNow);
      setUpDevice(mode);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('редът е както преди разговора: без последния коментар и брояча', async () => {
      const { plan } = planWithThread();
      servePlans({ [thisWeek]: plan });

      renderApp('/menu');

      const meals = await screen.findByRole('list', { name: 'Вечери' });
      expect(meals).toHaveTextContent('Мусака');
      expect(meals).not.toHaveTextContent('така по-добре');
      expect(meals).not.toHaveTextContent('в разговора');
      expect(meals).not.toHaveTextContent('💬');
    });
  },
);
