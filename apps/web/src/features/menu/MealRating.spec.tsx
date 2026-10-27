import type { MealPlan } from '@family/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dinnerRecipes, planFor, servePlans, thisWeek } from '../../test/menu';
import { dani, fixtureNow } from '../../test/msw';
import { serveRating } from '../../test/recipes';
import { renderApp, setUpDevice } from '../../test/render';

const [chicken, lentils, moussaka] = dinnerRecipes;

function withRecipe(
  recipe: { id: string; title: string },
  rating: number | null = null,
) {
  return {
    recipeId: recipe.id,
    recipe: { title: recipe.title, archivedAt: null, rating },
  };
}

/**
 * Седмицата на `fixtureNow` (сряда, 4 ноември): понеделник (пиле, неоценено) и вторник (мусака, 4 звезди) са минали;
 * сряда е днес (леща, неоценена), четвъртък е само бележка.
 */
function ratingPlan(): MealPlan {
  return planFor(thisWeek, {
    0: withRecipe(chicken),
    1: withRecipe(moussaka, 4),
    2: withRecipe(lentils),
    3: { note: 'остатъци' },
  });
}

function row(text: string) {
  const found = within(screen.getByRole('list', { name: 'Вечери' }))
    .getAllByRole('listitem')
    .find((item) => item.textContent?.includes(text));
  if (!found) {
    throw new Error(`no row with ${text}`);
  }
  return found;
}

describe('MenuWeek: „Как беше?“', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(fixtureNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('се вижда само под отминало ястие с неоценена рецепта', async () => {
    setUpDevice('phone', dani.id);
    servePlans({ [thisWeek]: ratingPlan() });

    renderApp('/menu');
    await screen.findByRole('list', { name: 'Вечери' });

    expect(
      within(row(chicken.title)).getByRole('group', { name: 'Как беше?' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('group', { name: 'Как беше?' })).toHaveLength(1);
    for (const other of [moussaka.title, lentils.title, 'остатъци']) {
      expect(
        within(row(other)).queryByRole('group', { name: 'Как беше?' }),
      ).toBeNull();
    }
  });

  it('оценката отива на рецептата и редът изчезва', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const plans = { [thisWeek]: ratingPlan() };
    servePlans(plans);
    const calls = serveRating([], ({ id, rating }) => {
      const plan = plans[thisWeek];
      if (plan) {
        plans[thisWeek] = {
          ...plan,
          meals: plan.meals.map((meal) =>
            meal.recipeId === id && meal.recipe
              ? { ...meal, recipe: { ...meal.recipe, rating } }
              : meal,
          ),
        };
      }
    });

    renderApp('/menu');
    await screen.findByRole('list', { name: 'Вечери' });
    await user.click(
      within(
        within(row(chicken.title)).getByRole('group', { name: 'Как беше?' }),
      ).getByRole('button', { name: '5 от 5' }),
    );

    expect(screen.queryByRole('group', { name: 'Как беше?' })).toBeNull();
    await expect.poll(() => calls).toEqual([{ id: chicken.id, rating: 5 }]);
    expect(screen.queryByRole('group', { name: 'Как беше?' })).toBeNull();
  });

  it('kiosk не пита „Как беше?“', async () => {
    setUpDevice('kiosk');
    servePlans({ [thisWeek]: ratingPlan() });

    renderApp('/menu');
    await screen.findByRole('list', { name: 'Вечери' });

    expect(screen.queryByRole('group', { name: 'Как беше?' })).toBeNull();
  });
});
