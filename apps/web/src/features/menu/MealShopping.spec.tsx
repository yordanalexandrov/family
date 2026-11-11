import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dinnerRecipes, planFor, servePlans, thisWeek } from '../../test/menu';
import { dani, fixtureNow } from '../../test/msw';
import { goOffline } from '../../test/network';
import { renderApp, setUpDevice } from '../../test/render';
import { serveShopping, withMenu } from '../../test/shopping';

const [, , moussaka] = dinnerRecipes;

/** Четвъртък с мусака, петък само с бележка. */
function plan() {
  return planFor(thisWeek, {
    3: {
      recipeId: moussaka.id,
      recipe: { title: moussaka.title, archivedAt: null, rating: null },
    },
    4: { note: 'ядем навън' },
  });
}

async function openSheet(title: RegExp, name: string) {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  await screen.findByRole('list', { name: 'Вечери' });
  await user.click(await screen.findByRole('button', { name: title }));
  return { user, sheet: screen.getByRole('dialog', { name }) };
}

describe('MealSheet: превключвателят „В списъка за пазаруване“ (ADR-0011)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(fixtureNow);
    setUpDevice('phone', dani.id);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('включен добавя ястието в списъка, а изключен го маха', async () => {
    const week = plan();
    const thursday = week.meals[3]?.id ?? '';
    servePlans({ [thisWeek]: week });
    const shopping = serveShopping({ [thisWeek]: withMenu(thisWeek) });

    renderApp('/menu');
    const { user, sheet } = await openSheet(/Мусака/, 'четвъртък, 5 ноември');
    const listed = within(sheet).getByRole('switch', {
      name: 'В списъка за пазаруване',
    });
    expect(listed).not.toBeChecked();
    // Докато списъкът на седмицата не е прочетен, не се знае дали ястието е в него.
    await vi.waitFor(() => expect(listed).toBeEnabled());

    await user.click(listed);

    await vi.waitFor(() => expect(listed).toBeChecked());
    await vi.waitFor(() => expect(listed).toBeEnabled());

    await user.click(listed);

    await vi.waitFor(() => expect(listed).not.toBeChecked());
    expect(
      shopping.requests.map(({ method, path, actingUser }) => ({
        method,
        path,
        actingUser,
      })),
    ).toEqual([
      {
        method: 'PUT',
        path: `${thisWeek}/meals/${thursday}`,
        actingUser: dani.id,
      },
      {
        method: 'DELETE',
        path: `${thisWeek}/meals/${thursday}`,
        actingUser: dani.id,
      },
    ]);
  });

  it('е включен за ястие, което вече е в списъка', async () => {
    const week = plan();
    servePlans({ [thisWeek]: week });
    serveShopping({
      [thisWeek]: withMenu(thisWeek, [week.meals[3]?.id ?? '']),
    });

    renderApp('/menu');
    const { sheet } = await openSheet(/Мусака/, 'четвъртък, 5 ноември');

    const listed = within(sheet).getByRole('switch', {
      name: 'В списъка за пазаруване',
    });
    await vi.waitFor(() => expect(listed).toBeChecked());
  });

  it('няма превключвател за ястие само с бележка', async () => {
    servePlans({ [thisWeek]: plan() });
    serveShopping({ [thisWeek]: withMenu(thisWeek) });

    renderApp('/menu');
    const { sheet } = await openSheet(/ядем навън/, 'петък, 6 ноември');

    expect(
      within(sheet).getByRole('heading', { name: 'ядем навън' }),
    ).toBeInTheDocument();
    expect(
      within(sheet).queryByRole('switch', { name: /списъка/ }),
    ).not.toBeInTheDocument();
  });

  it('без връзка превключвателят е изключен с „Иска връзка“', async () => {
    servePlans({ [thisWeek]: plan() });
    serveShopping({ [thisWeek]: withMenu(thisWeek) });

    renderApp('/menu');
    const { sheet } = await openSheet(/Мусака/, 'четвъртък, 5 ноември');
    const add = within(sheet).getByRole('switch', {
      name: 'В списъка за пазаруване',
    });
    await vi.waitFor(() => expect(add).toBeEnabled());

    const online = goOffline();
    try {
      await vi.waitFor(() => expect(add).toBeDisabled());
      expect(add).toHaveAccessibleDescription('Иска връзка');
    } finally {
      online();
    }
  });
});

describe('MealRow: 🛒 на ястията в списъка (ADR-0011)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(fixtureNow);
    setUpDevice('phone', dani.id);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('показва 🛒 само на реда на ястието, което е в списъка', async () => {
    const week = planFor(thisWeek, {
      2: {
        recipeId: dinnerRecipes[1].id,
        recipe: {
          title: dinnerRecipes[1].title,
          archivedAt: null,
          rating: null,
        },
      },
      3: {
        recipeId: moussaka.id,
        recipe: { title: moussaka.title, archivedAt: null, rating: null },
      },
    });
    servePlans({ [thisWeek]: week });
    serveShopping({
      [thisWeek]: withMenu(thisWeek, [week.meals[3]?.id ?? '']),
    });

    renderApp('/menu');
    const thursday = await screen.findByRole('button', { name: /Мусака/ });

    expect(
      await within(thursday).findByRole('img', {
        name: 'в списъка за пазаруване',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('img', { name: 'в списъка за пазаруване' }),
    ).toHaveLength(1);
  });
});
