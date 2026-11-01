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

describe('MealSheet: „🛒 Добави в списъка“ (ADR-0011)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(fixtureNow);
    setUpDevice('phone', dani.id);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('добавя ястието в списъка, показва „🛒 В списъка ✓“, а повторното докосване го маха', async () => {
    const week = plan();
    const thursday = week.meals[3]?.id ?? '';
    servePlans({ [thisWeek]: week });
    const shopping = serveShopping({ [thisWeek]: withMenu(thisWeek) });

    renderApp('/menu');
    const { user, sheet } = await openSheet(/Мусака/, 'четвъртък, 5 ноември');
    const add = await within(sheet).findByRole('button', {
      name: '🛒 Добави в списъка',
    });
    expect(add).toHaveAttribute('aria-pressed', 'false');
    // Докато списъкът на седмицата не е прочетен, не се знае дали ястието е в него.
    await vi.waitFor(() => expect(add).toBeEnabled());

    await user.click(add);

    const listed = await within(sheet).findByRole('button', {
      name: '🛒 В списъка ✓',
    });
    expect(listed).toHaveAttribute('aria-pressed', 'true');
    await vi.waitFor(() => expect(listed).toBeEnabled());

    await user.click(listed);

    expect(
      await within(sheet).findByRole('button', { name: '🛒 Добави в списъка' }),
    ).toHaveAttribute('aria-pressed', 'false');
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

  it('показва „🛒 В списъка ✓“ за ястие, което вече е в списъка', async () => {
    const week = plan();
    servePlans({ [thisWeek]: week });
    serveShopping({
      [thisWeek]: withMenu(thisWeek, [week.meals[3]?.id ?? '']),
    });

    renderApp('/menu');
    const { sheet } = await openSheet(/Мусака/, 'четвъртък, 5 ноември');

    expect(
      await within(sheet).findByRole('button', { name: '🛒 В списъка ✓' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('няма бутон за ястие само с бележка', async () => {
    servePlans({ [thisWeek]: plan() });
    serveShopping({ [thisWeek]: withMenu(thisWeek) });

    renderApp('/menu');
    const { sheet } = await openSheet(/ядем навън/, 'петък, 6 ноември');

    expect(
      within(sheet).getByRole('heading', { name: 'ядем навън' }),
    ).toBeInTheDocument();
    expect(
      within(sheet).queryByRole('button', { name: /списъка/ }),
    ).not.toBeInTheDocument();
  });

  it('без връзка бутонът е изключен с „Иска връзка“', async () => {
    servePlans({ [thisWeek]: plan() });
    serveShopping({ [thisWeek]: withMenu(thisWeek) });

    renderApp('/menu');
    const { sheet } = await openSheet(/Мусака/, 'четвъртък, 5 ноември');
    await within(sheet).findByRole('button', { name: '🛒 Добави в списъка' });

    const online = goOffline();
    try {
      const add = await within(sheet).findByRole('button', {
        name: '🛒 Добави в списъка',
      });
      await vi.waitFor(() => expect(add).toBeDisabled());
      expect(add).toHaveAccessibleDescription('Иска връзка');
    } finally {
      online();
    }
  });
});
