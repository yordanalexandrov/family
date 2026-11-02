import type { MealPlan, Recipe } from '@family/shared';
import { screen, within } from '@testing-library/react';
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
import { chickenWithRice } from '../../test/recipes';
import { renderApp, setUpDevice } from '../../test/render';

const [chicken, lentils, moussaka, fish] = dinnerRecipes;

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
 * Седмицата на `fixtureNow` (сряда, 4 ноември): понеделник (пиле, неоценено) и вторник (мусака, 4 звезди) са минали,
 * сряда е днес (леща), четвъртък е утре (риба), петък е само бележка.
 */
function feedbackPlan(): MealPlan {
  return planFor(thisWeek, {
    0: withRecipe(chicken),
    1: withRecipe(moussaka, 4),
    2: withRecipe(lentils),
    3: withRecipe(fish),
    4: { note: 'ядем навън' },
  });
}

/** Пълната рецепта на ястието от менюто: листът „Как мина?“ я чете с `GET /api/recipes/:id`. */
function recipeOf(dish: { id: string; title: string }): Recipe {
  return { ...chickenWithRice, id: dish.id, title: dish.title };
}

function serveRecipes() {
  server.use(
    http.get('/api/recipes/:id', ({ params }) => {
      const dish = dinnerRecipes.find((recipe) => recipe.id === params.id);
      return dish
        ? HttpResponse.json({ recipe: recipeOf(dish) })
        : HttpResponse.json({ error: 'not_found' }, { status: 404 });
    }),
  );
}

/** `POST /api/recipes/:id/revisions` → 202; връща рецептата и тялото на всяка заявка. */
function serveRevisions() {
  const posts: { recipeId: string; body: unknown }[] = [];
  server.use(
    http.post('/api/recipes/:id/revisions', async ({ params, request }) => {
      const body = (await request.json()) as { instruction: string };
      posts.push({ recipeId: String(params.id), body });
      return HttpResponse.json(
        {
          request: {
            id: 'dddddddd-0000-4000-8000-000000000001',
            recipeId: params.id,
            instruction: body.instruction,
            applied: [],
            status: 'pending',
            requestedBy: dani.id,
            createdAt: '2026-11-04T19:00:00.000Z',
            stale: false,
          },
        },
        { status: 202 },
      );
    }),
  );
  return posts;
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

function feedbackButton(text: string) {
  return within(row(text)).queryByRole('button', { name: 'Как мина?' });
}

describe('MenuWeek: „Как мина?“', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(fixtureNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('е на днешното и на миналите ястия с рецепта, но не на бъдещо и не на ястие без рецепта', async () => {
    setUpDevice('phone', dani.id);
    servePlans({ [thisWeek]: feedbackPlan() });

    renderApp('/menu');
    await screen.findByRole('list', { name: 'Вечери' });
    await showPastDays();

    for (const dish of [chicken.title, moussaka.title, lentils.title]) {
      expect(feedbackButton(dish)).toBeInTheDocument();
    }
    expect(feedbackButton(fish.title)).toBeNull();
    expect(feedbackButton('ядем навън')).toBeNull();
    // Неоцененото минало ястие пази и сегашните звезди „Как беше?“.
    expect(
      within(row(chicken.title)).getByRole('group', { name: 'Как беше?' }),
    ).toBeInTheDocument();
  });

  it('е и на kiosk, без действащ потребител', async () => {
    setUpDevice('kiosk');
    servePlans({ [thisWeek]: feedbackPlan() });

    renderApp('/menu');
    await screen.findByRole('list', { name: 'Вечери' });

    expect(feedbackButton(lentils.title)).toBeInTheDocument();
    expect(feedbackButton(chicken.title)).toBeInTheDocument();
    expect(feedbackButton(fish.title)).toBeNull();
  });

  it('„Изпрати“ пуска поправка на рецептата на ястието и затваря листа', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    servePlans({ [thisWeek]: feedbackPlan() });
    serveRecipes();
    const posts = serveRevisions();

    renderApp('/menu');
    await screen.findByRole('list', { name: 'Вечери' });
    const button = feedbackButton(lentils.title);
    if (!button) {
      throw new Error('no „Как мина?“ on today');
    }
    await user.click(button);
    const sheet = await screen.findByRole('dialog', { name: 'Как мина?' });
    await user.type(
      await within(sheet).findByLabelText('Какво да се промени?'),
      'по-малко сол',
    );
    await user.click(within(sheet).getByRole('button', { name: 'Изпрати' }));

    await vi.waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Как мина?' })).toBeNull(),
    );
    expect(posts).toEqual([
      { recipeId: lentils.id, body: { instruction: 'по-малко сол' } },
    ]);
  });
});
