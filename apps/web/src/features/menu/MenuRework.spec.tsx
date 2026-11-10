import type { MealPlan, MenuReworkRequest } from '@family/shared';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dinnerRecipes,
  planFor,
  servePlans,
  thisWeek,
  votesOf,
} from '../../test/menu';
import { dani, fixtureNow, server } from '../../test/msw';
import { renderApp, setUpDevice } from '../../test/render';

const [chicken, lentils, moussaka, fish] = dinnerRecipes;

function withRecipe(recipe: { id: string; title: string }) {
  return {
    recipeId: recipe.id,
    recipe: { title: recipe.title, archivedAt: null, rating: null },
  };
}

/**
 * Седмицата на `fixtureNow` (сряда, 4 ноември): понеделник и вторник са минали и не се броят. От сряда: леща „за“ от
 * двамата (остава), мусака с „за“ от Дани и „против“ от Поли (сменя се), риба без гласове (сменя се), събота само с
 * бележка (остава), неделя празна (попълва се).
 */
function mixedPlan(): MealPlan {
  return planFor(thisWeek, {
    0: { ...withRecipe(chicken), votes: votesOf('down', 'down') },
    2: { ...withRecipe(lentils), votes: votesOf('up', 'up') },
    3: { ...withRecipe(moussaka), votes: votesOf('up', 'down') },
    4: { ...withRecipe(fish) },
    5: { note: 'ядем навън' },
  });
}

/** Всичко от днес нататък остава; минал понеделник е празен, но не се попълва. */
function agreedPlan(): MealPlan {
  return planFor(
    thisWeek,
    Object.fromEntries(
      [2, 3, 4, 5, 6].map((day) => [
        day,
        { ...withRecipe(lentils), votes: votesOf('up') },
      ]),
    ),
  );
}

const BUTTON = { name: '✨ Преработи менюто' };

const reworkId = 'dddddddd-0000-4000-8000-000000000001';

const pendingRework: MenuReworkRequest = {
  id: reworkId,
  weekStart: thisWeek,
  planId: planFor(thisWeek).id,
  status: 'pending',
  requestedBy: dani.id,
  createdAt: '2026-11-04T08:00:00.000Z',
};

/**
 * `POST /api/menu/reworks` → 202 с `pending` (телата се пазят по ред), после `GET /api/menu/reworks/:id` с поредните
 * състояния; последното се повтаря.
 */
function serveRework(...states: MenuReworkRequest[]) {
  const bodies: unknown[] = [];
  let calls = 0;
  server.use(
    http.post('/api/menu/reworks', async ({ request }) => {
      const body = (await request.json()) as { hint?: string };
      bodies.push(body);
      return HttpResponse.json(
        {
          rework: {
            ...pendingRework,
            ...(body.hint ? { hint: body.hint } : {}),
          },
        },
        { status: 202 },
      );
    }),
    http.get(`/api/menu/reworks/${reworkId}`, () => {
      const rework = states[Math.min(calls, states.length - 1)];
      calls += 1;
      return HttpResponse.json({ rework });
    }),
  );
  return bodies;
}

describe('MenuWeek: преработка на менюто', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(fixtureNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('бутонът', () => {
    it('се вижда на телефона, когато има какво да се смени или попълни', async () => {
      setUpDevice('phone', dani.id);
      servePlans({ [thisWeek]: mixedPlan() });

      renderApp('/menu');

      expect(await screen.findByRole('button', BUTTON)).toBeVisible();
    });

    it('се вижда в браузъра и за седмица само с празни дни', async () => {
      setUpDevice('browser', dani.id);
      servePlans({ [thisWeek]: planFor(thisWeek) });

      renderApp('/menu');

      expect(await screen.findByRole('button', BUTTON)).toBeVisible();
    });

    it('го няма при съгласувано меню', async () => {
      setUpDevice('phone', dani.id);
      servePlans({ [thisWeek]: agreedPlan() });

      renderApp('/menu');
      await screen.findByRole('list', { name: 'Вечери' });

      expect(screen.queryByRole('button', BUTTON)).not.toBeInTheDocument();
    });

    it('го няма на kiosk', async () => {
      setUpDevice('kiosk');
      servePlans({ [thisWeek]: mixedPlan() });

      renderApp('/menu');
      await screen.findByRole('list', { name: 'Вечери' });

      expect(screen.queryByRole('button', BUTTON)).not.toBeInTheDocument();
    });
  });

  describe('диалогът', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(fixtureNow);
      setUpDevice('phone', dani.id);
    });

    async function openDialog() {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderApp('/menu');
      await user.click(await screen.findByRole('button', BUTTON));
      return {
        user,
        dialog: screen.getByRole('dialog', { name: 'Преработи менюто' }),
      };
    }

    it('показва колко остават, сменят се и попълват се, и сменяните дни с причината', async () => {
      servePlans({ [thisWeek]: mixedPlan() });

      const { dialog } = await openDialog();

      expect(dialog).toHaveTextContent(
        'Остават 2 · сменят се 2 · попълват се 1',
      );
      const days = within(
        within(dialog).getByRole('list', { name: 'Какво се сменя' }),
      ).getAllByRole('listitem');
      expect(days.map((day) => day.textContent)).toEqual([
        'Чт 5.11 · Мусака — против от Поли',
        'Пт 6.11 · Риба на фурна — без гласове',
        'Нд 8.11 · празно',
      ]);
    });

    it('„Преработи“ пуска преработката с подсказката, чака я и при успех показва новото меню', async () => {
      const plan = mixedPlan();
      servePlans({ [thisWeek]: plan });
      const bodies = serveRework(pendingRework, {
        ...pendingRework,
        status: 'done',
        changed: 3,
        finishedAt: '2026-11-04T08:01:00.000Z',
      });

      const { user, dialog } = await openDialog();
      await user.type(
        within(dialog).getByRole('textbox', { name: 'Подсказка' }),
        'по-леко',
      );
      await user.click(
        within(dialog).getByRole('button', { name: 'Преработи' }),
      );

      expect(
        await within(dialog).findByText('AI преработва менюто…'),
      ).toBeVisible();
      expect(bodies).toEqual([{ weekStart: thisWeek, hint: 'по-леко' }]);

      plan.meals = plan.meals.map((meal, day) =>
        day === 3 ? { ...meal, ...withRecipe(chicken), votes: [] } : meal,
      );
      await act(() => vi.advanceTimersByTimeAsync(3000));

      const meals = screen.getByRole('list', { name: 'Вечери' });
      expect(await within(meals).findByText('Пиле с ориз')).toBeVisible();
      expect(within(meals).queryByText('Мусака')).not.toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('при not_enough_recipes казва колко рецепти липсват и пуска наново', async () => {
      servePlans({ [thisWeek]: mixedPlan() });
      const bodies = serveRework(pendingRework);
      let refused = false;
      server.use(
        http.post('/api/menu/reworks', () => {
          if (refused) {
            return;
          }
          refused = true;
          return HttpResponse.json(
            {
              error: 'conflict',
              code: 'not_enough_recipes',
              message:
                'За преработката трябват поне 3 свободни вечерни рецепти',
              have: 1,
              need: 3,
            },
            { status: 409 },
          );
        }),
      );

      const { user, dialog } = await openDialog();
      await user.click(
        within(dialog).getByRole('button', { name: 'Преработи' }),
      );

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'Трябват още 2 вечерни рецепти.',
      );
      await user.click(
        within(dialog).getByRole('button', { name: 'Преработи' }),
      );
      expect(
        await within(dialog).findByText('AI преработва менюто…'),
      ).toBeVisible();
      expect(bodies).toEqual([{ weekStart: thisWeek }]);
    });

    it('при неуспех на AI показва причината и „Опитай пак“ със същата подсказка', async () => {
      servePlans({ [thisWeek]: mixedPlan() });
      const bodies = serveRework({
        ...pendingRework,
        hint: 'по-леко',
        status: 'failed',
        error: 'timeout',
        finishedAt: '2026-11-04T08:03:00.000Z',
      });

      const { user, dialog } = await openDialog();
      await user.type(
        within(dialog).getByRole('textbox', { name: 'Подсказка' }),
        'по-леко',
      );
      await user.click(
        within(dialog).getByRole('button', { name: 'Преработи' }),
      );

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'AI не отговори за 3 минути. Менюто е непроменено. Опитай пак.',
      );
      expect(
        within(dialog).getByRole('textbox', { name: 'Подсказка' }),
      ).toHaveValue('по-леко');
      await user.click(
        within(dialog).getByRole('button', { name: 'Опитай пак' }),
      );
      expect(bodies).toEqual([
        { weekStart: thisWeek, hint: 'по-леко' },
        { weekStart: thisWeek, hint: 'по-леко' },
      ]);
    });
  });
});
