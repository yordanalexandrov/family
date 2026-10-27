import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dinnerRecipes,
  planFor,
  serveDinnerRecipes,
  servePlans,
  serveVotes,
  thisWeek,
  votesOf,
} from '../../test/menu';
import { dani, fixtureNow, server } from '../../test/msw';
import { renderApp, setUpDevice } from '../../test/render';
import { serveShopping, shoppingList } from '../../test/shopping';

const [chicken, lentils, moussaka, fish, pasta] = dinnerRecipes;

function withRecipe(recipe: { id: string; title: string }) {
  return {
    recipeId: recipe.id,
    recipe: { title: recipe.title, archivedAt: null, rating: null },
  };
}

/**
 * Седмицата на `fixtureNow` (сряда, 4 ноември): понеделник и вторник са минали. Всеки изход по веднъж, плюс два дни,
 * които чакат глас.
 */
function mixedPlan() {
  return planFor(thisWeek, {
    0: { ...withRecipe(chicken), votes: votesOf('down', 'down') },
    1: { note: 'остатъци' },
    2: { ...withRecipe(lentils), votes: votesOf('up', 'up') },
    3: { ...withRecipe(moussaka), votes: votesOf('down', 'down') },
    4: { ...withRecipe(fish), votes: votesOf('up', 'down') },
    5: { ...withRecipe(pasta), votes: votesOf(undefined, 'up') },
  });
}

/** Всички ястия от днес нататък са „Остава“; миналите дни не участват. */
function agreedPlan() {
  return planFor(
    thisWeek,
    Object.fromEntries(
      [0, 1, 2, 3, 4, 5, 6].map((day) => [
        day,
        { votes: day < 2 ? votesOf() : votesOf('up', 'up') },
      ]),
    ),
  );
}

function rows() {
  return within(screen.getByRole('list', { name: 'Вечери' })).getAllByRole(
    'listitem',
  );
}

function row(text: string) {
  const found = rows().find((item) => item.textContent?.includes(text));
  if (!found) {
    throw new Error(`no row with ${text}`);
  }
  return found;
}

describe('MenuWeek: гласове', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(fixtureNow);
    setUpDevice('phone', dani.id);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('всеки ден от днес нататък показва моя глас, гласа на другия и изхода', async () => {
    servePlans({ [thisWeek]: mixedPlan() });

    renderApp('/menu');
    await screen.findByRole('list', { name: 'Вечери' });

    const keep = row(lentils.title);
    expect(keep).toHaveTextContent('Остава');
    expect(within(keep).getByRole('button', { name: 'За' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(keep).toHaveTextContent('Поли: за');
    expect(row(moussaka.title)).toHaveTextContent('За смяна');
    const discuss = row(fish.title);
    expect(discuss).toHaveTextContent('Да поговорим');
    expect(discuss).toHaveTextContent('Поли: против');
    const pending = row(pasta.title);
    expect(pending).toHaveTextContent('Чака глас');
    expect(within(pending).getByRole('button', { name: 'За' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(row('Избери ястие')).toHaveTextContent('Поли: няма глас');
  });

  it('миналите дни са само за четене: без бутони за глас и без изход', async () => {
    servePlans({ [thisWeek]: mixedPlan() });

    renderApp('/menu');
    await screen.findByRole('list', { name: 'Вечери' });

    for (const past of [row(chicken.title), row('остатъци')]) {
      expect(within(past).queryByRole('button', { name: 'За' })).toBeNull();
      expect(within(past).queryByRole('button', { name: 'Против' })).toBeNull();
      expect(past).not.toHaveTextContent('За смяна');
      expect(past).not.toHaveTextContent('Чака глас');
    }
  });

  it('филтрите броят изходите без миналите дни и показват само своите ястия', async () => {
    const user = userEvent.setup();
    servePlans({ [thisWeek]: mixedPlan() });

    renderApp('/menu');
    const filters = await screen.findByRole('tablist', { name: 'Филтър' });
    expect(
      within(filters).getByRole('tab', { name: 'Всички' }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(rows()).toHaveLength(7);

    await user.click(within(filters).getByRole('tab', { name: 'За смяна 1' }));
    expect(rows().map((item) => item.textContent)).toEqual([
      expect.stringContaining(moussaka.title),
    ]);

    await user.click(within(filters).getByRole('tab', { name: 'Чака глас 2' }));
    expect(rows()).toHaveLength(2);
    expect(rows()[0]).toHaveTextContent(pasta.title);

    await user.click(
      within(filters).getByRole('tab', { name: 'Да поговорим 1' }),
    );
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveTextContent(fish.title);
  });

  it('глас веднага се вижда, втори натиск го маха с DELETE', async () => {
    const user = userEvent.setup();
    const plan = mixedPlan();
    servePlans({ [thisWeek]: plan });
    const requests = serveVotes(plan);
    const saturday = plan.meals[5]?.id;

    renderApp('/menu');
    await screen.findByRole('list', { name: 'Вечери' });
    await user.click(
      within(row(pasta.title)).getByRole('button', { name: 'За' }),
    );

    expect(
      within(row(pasta.title)).getByRole('button', { name: 'За' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => row(pasta.title).textContent).toContain('Остава');

    await user.click(
      within(row(pasta.title)).getByRole('button', { name: 'За' }),
    );
    await expect
      .poll(() =>
        within(row(pasta.title))
          .getByRole('button', { name: 'За' })
          .getAttribute('aria-pressed'),
      )
      .toBe('false');
    expect(requests).toEqual([
      { method: 'PUT', id: saturday, body: { value: 'up' } },
      { method: 'DELETE', id: saturday, body: undefined },
    ]);
  });

  it('при грешка гласът се връща и се показва съобщението', async () => {
    const user = userEvent.setup();
    servePlans({ [thisWeek]: mixedPlan() });
    server.use(
      http.put('/api/menu/meals/:id/vote', () =>
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

    renderApp('/menu');
    await screen.findByRole('list', { name: 'Вечери' });
    await user.click(
      within(row(pasta.title)).getByRole('button', { name: 'Против' }),
    );

    expect(await screen.findByText(/Денят е минал/)).toBeInTheDocument();
    expect(
      within(row(pasta.title)).getByRole('button', { name: 'Против' }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(row(pasta.title)).toHaveTextContent('Чака глас');
  });

  it('съгласувано меню: лента отгоре вместо филтрите', async () => {
    servePlans({ [thisWeek]: agreedPlan() });

    renderApp('/menu');

    expect(await screen.findByText('Менюто е съгласувано')).toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: 'Филтър' })).toBeNull();
  });

  it('листът на ястието показва отгоре гласовете на двамата; на минал ден не сменя рецептата', async () => {
    const user = userEvent.setup();
    servePlans({ [thisWeek]: mixedPlan() });
    serveDinnerRecipes();

    renderApp('/menu');
    await user.click(
      await screen.findByRole('button', { name: new RegExp(fish.title) }),
    );
    const sheet = screen.getByRole('dialog', { name: 'петък, 6 ноември' });
    const votes = within(sheet).getByRole('group', { name: 'Гласове' });
    expect(votes).toHaveTextContent('Дани: за');
    expect(votes).toHaveTextContent('Поли: против');
    expect(votes).toHaveTextContent('Да поговорим');
    expect(within(votes).getByRole('button', { name: 'За' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    await user.click(
      screen.getByRole('button', { name: new RegExp(chicken.title) }),
    );
    const past = screen.getByRole('dialog', { name: 'понеделник, 2 ноември' });
    expect(
      within(past).queryByRole('searchbox', { name: 'Търси рецепта' }),
    ).toBeNull();
    expect(within(past).queryByRole('textbox', { name: 'Бележка' })).toBeNull();
    expect(within(past).queryByRole('button', { name: 'За' })).toBeNull();
    expect(
      within(past).getByRole('button', { name: 'Поли' }),
    ).toBeInTheDocument();
  });
});

describe('MenuWeek: гласове на kiosk', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(fixtureNow);
    setUpDevice('kiosk');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('kiosk не показва гласове, филтри и лента', async () => {
    servePlans({ [thisWeek]: mixedPlan() });

    renderApp('/menu');
    await screen.findByRole('list', { name: 'Вечери' });

    expect(screen.queryByRole('button', { name: 'За' })).toBeNull();
    expect(screen.queryByRole('tablist', { name: 'Филтър' })).toBeNull();
    expect(screen.queryByText('Да поговорим')).toBeNull();
  });
});

describe('ShoppingWeek: несъгласувано меню', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(fixtureNow);
    setUpDevice('phone', dani.id);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('докато менюто не е съгласувано, лента казва колко ястия чакат и води към менюто', async () => {
    serveShopping({ [thisWeek]: shoppingList() });
    servePlans({ [thisWeek]: mixedPlan() });

    renderApp('/shopping');

    const banner = await screen.findByText(/Менюто още не е съгласувано/);
    expect(banner).toHaveTextContent(
      'Менюто още не е съгласувано: 4 ястия чакат',
    );
    expect(screen.getByRole('link', { name: 'Към менюто' })).toHaveAttribute(
      'href',
      '/menu',
    );
    // Списъкът не се филтрира по гласовете.
    expect(screen.getByText('5 от 6')).toBeInTheDocument();
  });

  it('съгласувано меню — без лента', async () => {
    serveShopping({ [thisWeek]: shoppingList() });
    const asked = servePlans({ [thisWeek]: agreedPlan() });

    renderApp('/shopping');

    expect(await screen.findByText('5 от 6')).toBeInTheDocument();
    await expect.poll(() => asked).toContain(thisWeek);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(/Менюто още не е съгласувано/)).toBeNull();
  });
});
