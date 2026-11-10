import type { MealPlan, MenuReworkRequest } from '@family/shared';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockEventSource, source } from '../../test/events';
import {
  dinnerRecipes,
  failedRework,
  nextWeek,
  pendingRework,
  planFor,
  reworkId,
  servePlans,
  serveWeekRework,
  thisWeek,
  votesOf,
} from '../../test/menu';
import { apiError, dani, fixtureNow, poli, server } from '../../test/msw';
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

  describe('лентата', () => {
    const BANNER = 'AI преработва менюто…';

    it('на телефона казва, че AI преработва менюто, а гласовете и бутонът за преработка ги няма', async () => {
      setUpDevice('phone', poli.id);
      servePlans({ [thisWeek]: mixedPlan() });
      serveWeekRework(pendingRework);

      renderApp('/menu');

      expect(await screen.findByText(BANNER)).toBeVisible();
      const meals = screen.getByRole('list', { name: 'Вечери' });
      for (const button of within(meals).getAllByRole('button', {
        name: /^(Не|Да)$/,
      })) {
        expect(button).toBeDisabled();
      }
      expect(screen.queryByRole('button', BUTTON)).not.toBeInTheDocument();
    });

    it('скрива „Изтрий плана“ на седмица, която още не е започнала', async () => {
      setUpDevice('phone', poli.id);
      servePlans({
        [thisWeek]: mixedPlan(),
        [nextWeek]: planFor(nextWeek, { 0: { ...withRecipe(fish) } }),
      });
      serveWeekRework({ ...pendingRework, weekStart: nextWeek });
      const user = userEvent.setup();
      renderApp('/menu');
      await screen.findByRole('list', { name: 'Вечери' });

      await user.click(screen.getByRole('tab', { name: 'Следваща седмица' }));

      expect(await screen.findByText(BANNER)).toBeVisible();
      expect(
        screen.queryByRole('button', { name: 'Изтрий плана' }),
      ).not.toBeInTheDocument();
    });

    it('в листа на ястието спира гласа, разговора и смените, а готвачът и порциите остават', async () => {
      setUpDevice('phone', poli.id);
      servePlans({ [thisWeek]: mixedPlan() });
      serveWeekRework(pendingRework);
      const user = userEvent.setup();
      renderApp('/menu');
      await screen.findByText(BANNER);

      await user.click(screen.getByRole('button', { name: /Мусака/ }));

      const sheet = screen.getByRole('dialog');
      expect(sheet).toHaveTextContent(
        'AI преработва менюто: изчакай да свърши',
      );
      for (const name of ['Не', 'Да']) {
        expect(within(sheet).getByRole('button', { name })).toBeDisabled();
      }
      expect(
        within(sheet).queryByRole('textbox', { name: 'Коментар' }),
      ).not.toBeInTheDocument();
      for (const name of [
        'Избери сам',
        '✨ Предложи друго',
        'Размени с…',
        'Запази',
      ]) {
        expect(
          within(sheet).queryByRole('button', { name }),
        ).not.toBeInTheDocument();
      }
      const cook = within(sheet).getByRole('group', { name: 'Готвач' });
      expect(within(cook).getByRole('button', { name: /Поли/ })).toBeEnabled();
      expect(
        within(sheet).getByRole('button', { name: 'Повече порции за Поли' }),
      ).toBeEnabled();
    });

    it('при 409 menu_reworking от гонка показва съобщението на api-то и лентата', async () => {
      setUpDevice('phone', poli.id);
      servePlans({ [thisWeek]: mixedPlan() });
      const user = userEvent.setup();
      renderApp('/menu');
      const meals = await screen.findByRole('list', { name: 'Вечери' });
      // Дани е пуснал преработка; сигналът още не е стигнал до телефона на Поли.
      serveWeekRework(pendingRework);
      server.use(
        http.put('/api/menu/meals/:id/vote', () =>
          apiError(
            409,
            'conflict',
            'AI преработва менюто: изчакай да свърши',
            'menu_reworking',
          ),
        ),
      );
      // Рибата е без гласове: „Да“ е нов глас.
      const fish = within(meals)
        .getByText('Риба на фурна')
        .closest('.meal-row') as HTMLElement;

      await user.click(within(fish).getByRole('button', { name: 'Да' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'AI преработва менюто: изчакай да свърши',
      );
      expect(await screen.findByText(BANNER)).toBeVisible();
    });

    describe('по SSE', () => {
      beforeEach(() => {
        MockEventSource.instances = [];
        vi.stubGlobal('EventSource', MockEventSource);
      });

      afterEach(() => {
        vi.unstubAllGlobals();
      });

      it('се появява на kiosk, когато другият пусне преработка', async () => {
        setUpDevice('kiosk');
        servePlans({ [thisWeek]: mixedPlan() });
        renderApp('/menu');
        await screen.findByRole('list', { name: 'Вечери' });
        source().open();
        serveWeekRework(pendingRework);

        act(() =>
          source().send({ type: 'menu.rework.changed', weekStart: thisWeek }),
        );

        expect(await screen.findByText(BANNER)).toBeVisible();
      });

      it('изчезва при край, гласовете се връщат и новото меню се вижда', async () => {
        setUpDevice('phone', poli.id);
        const plan = mixedPlan();
        servePlans({ [thisWeek]: plan });
        serveWeekRework(pendingRework);
        renderApp('/menu');
        await screen.findByText(BANNER);
        source().open();
        serveWeekRework({
          ...pendingRework,
          status: 'done',
          changed: 1,
          finishedAt: '2026-11-04T08:01:00.000Z',
        });
        plan.meals = plan.meals.map((meal, day) =>
          day === 3 ? { ...meal, ...withRecipe(chicken), votes: [] } : meal,
        );

        act(() => {
          source().send({ type: 'menu.rework.changed', weekStart: thisWeek });
          source().send({ type: 'menu.changed', weekStart: thisWeek });
        });

        await vi.waitFor(() =>
          expect(screen.queryByText(BANNER)).not.toBeInTheDocument(),
        );
        const meals = screen.getByRole('list', { name: 'Вечери' });
        expect(await within(meals).findByText('Пиле с ориз')).toBeVisible();
        for (const button of within(meals).getAllByRole('button', {
          name: /^(Не|Да)$/,
        })) {
          expect(button).toBeEnabled();
        }
      });

      it('при неуспех показва грешката, гласовете се връщат, а „Затвори“ я маха', async () => {
        setUpDevice('phone', poli.id);
        servePlans({ [thisWeek]: mixedPlan() });
        serveWeekRework(pendingRework);
        const user = userEvent.setup();
        renderApp('/menu');
        await screen.findByText(BANNER);
        source().open();
        serveWeekRework(failedRework);

        act(() =>
          source().send({ type: 'menu.rework.changed', weekStart: thisWeek }),
        );

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent(
          'AI не отговори за 3 минути. Менюто е непроменено. Опитай пак.',
        );
        expect(screen.queryByText(BANNER)).not.toBeInTheDocument();
        const meals = screen.getByRole('list', { name: 'Вечери' });
        for (const button of within(meals).getAllByRole('button', {
          name: /^(Не|Да)$/,
        })) {
          expect(button).toBeEnabled();
        }
        expect(screen.getByRole('button', BUTTON)).toBeVisible();

        await user.click(
          within(alert).getByRole('button', { name: 'Затвори' }),
        );

        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      });
    });
  });
});
