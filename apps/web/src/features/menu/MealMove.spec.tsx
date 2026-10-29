import type { MealPlan } from '@family/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dinnerRecipes,
  planFor,
  servePlans,
  showPastDays,
  thisWeek,
} from '../../test/menu';
import { dani, fixtureNow, server } from '../../test/msw';
import { renderApp, setUpDevice } from '../../test/render';

const [chicken, , moussaka] = dinnerRecipes;

/**
 * Мусака в четвъртък, пиле в петък и бележка в събота; понеделник и вторник са минали (`fixtureNow` е сряда).
 */
function planWithMoussaka() {
  return planFor(thisWeek, {
    5: { note: 'на гости у Иванови' },
    3: {
      recipeId: moussaka.id,
      recipe: { title: moussaka.title, archivedAt: null, rating: null },
    },
    4: {
      recipeId: chicken.id,
      recipe: { title: chicken.title, archivedAt: null, rating: null },
    },
  });
}

/**
 * `POST /api/menu/meals/:id/swap` като api: двете ястия разменят дните си и отговорът е планът, подреден по ден.
 * Връща заявките по ред.
 */
function serveSwaps(plan: MealPlan) {
  const swaps: { id: string; body: unknown }[] = [];
  server.use(
    http.post('/api/menu/meals/:id/swap', async ({ params, request }) => {
      const id = String(params.id);
      const body = (await request.json()) as { withMealId: string };
      swaps.push({ id, body });
      const a = plan.meals.find((meal) => meal.id === id);
      const b = plan.meals.find((meal) => meal.id === body.withMealId);
      if (!a || !b) {
        return HttpResponse.json({ error: 'not_found' }, { status: 404 });
      }
      plan.meals = plan.meals
        .map((meal) =>
          meal.id === a.id
            ? { ...a, date: b.date }
            : meal.id === b.id
              ? { ...b, date: a.date }
              : meal,
        )
        .sort((x, y) => x.date.localeCompare(y.date));
      return HttpResponse.json({ plan });
    }),
  );
  return swaps;
}

function rowNames() {
  return within(screen.getByRole('list', { name: 'Вечери' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent ?? '');
}

describe('MealSheet: „Размени с…“', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(fixtureNow);
    setUpDevice('phone', dani.id);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('предлага само дните от днес нататък без текущия, всеки с ястието си, и разменя ястието с избрания ден', async () => {
    const plan = planWithMoussaka();
    const [, , , thursday, friday] = plan.meals;
    servePlans({ [thisWeek]: plan });
    const swaps = serveSwaps(plan);
    const user = userEvent.setup();
    renderApp('/menu');
    await screen.findByRole('list', { name: 'Вечери' });
    await showPastDays(user);

    await user.click(screen.getByRole('button', { name: /Мусака/ }));
    const sheet = screen.getByRole('dialog', { name: /четвъртък/ });
    await user.click(within(sheet).getByRole('button', { name: 'Размени с…' }));
    const days = within(sheet).getByRole('group', { name: 'Размени с' });
    expect(
      within(days)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual([
      'сряда, 4 ноември празно',
      'петък, 6 ноември Пиле с ориз',
      'събота, 7 ноември на гости у Иванови',
      'неделя, 8 ноември празно',
    ]);
    await user.click(within(days).getByRole('button', { name: /петък/ }));

    expect(swaps).toEqual([
      { id: thursday?.id, body: { withMealId: friday?.id } },
    ]);
    await waitFor(() => {
      const rows = rowNames();
      expect(rows[3]).toMatch(/Пиле с ориз/);
      expect(rows[4]).toMatch(/Мусака/);
    });
  });

  it('при отказ връща реда на мястото му и показва грешката', async () => {
    const plan = planWithMoussaka();
    servePlans({ [thisWeek]: plan });
    server.use(
      http.post('/api/menu/meals/:id/swap', () =>
        HttpResponse.json(
          {
            error: 'conflict',
            code: 'past_meal',
            message: 'Денят е минал: ястието вече не се гласува и не се сменя',
          },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderApp('/menu');
    await screen.findByRole('list', { name: 'Вечери' });
    await showPastDays(user);

    await user.click(screen.getByRole('button', { name: /Мусака/ }));
    const sheet = screen.getByRole('dialog', { name: /четвъртък/ });
    await user.click(within(sheet).getByRole('button', { name: 'Размени с…' }));
    await user.click(within(sheet).getByRole('button', { name: /неделя/ }));

    expect(await within(sheet).findByRole('alert')).toHaveTextContent(
      'Денят е минал',
    );
    expect(rowNames()[3]).toMatch(/Мусака/);
    expect(rowNames()[6]).not.toMatch(/Мусака/);
  });

  it('минал ден няма „Размени с…“', async () => {
    const plan = planFor(thisWeek, {
      0: {
        recipeId: chicken.id,
        recipe: { title: chicken.title, archivedAt: null, rating: null },
      },
    });
    servePlans({ [thisWeek]: plan });
    const user = userEvent.setup();
    renderApp('/menu');
    await screen.findByRole('list', { name: 'Вечери' });
    await showPastDays(user);

    await user.click(screen.getByRole('button', { name: /Пиле/ }));
    const sheet = screen.getByRole('dialog', { name: /понеделник/ });

    expect(
      within(sheet).queryByRole('button', { name: 'Размени с…' }),
    ).toBeNull();
  });
});
