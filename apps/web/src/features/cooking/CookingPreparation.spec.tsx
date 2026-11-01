import type { PreparationItem, Recipe } from '@family/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { server } from '../../test/msw';
import { chickenWithRice } from '../../test/recipes';
import { renderApp, setUpDevice } from '../../test/render';

const oven = {
  kind: 'oven',
  degrees: 200,
  fan: 'fan',
  rack: 'middle',
} satisfies PreparationItem;
const butter = {
  kind: 'fridge',
  text: 'извади маслото',
  minutesBefore: 30,
} satisfies PreparationItem;

const roast: Recipe = {
  ...chickenWithRice,
  steps: [{ text: 'Нарежи пилето.' }, { text: 'Печи 40 мин.' }],
  preparation: [oven, butter],
};

const OVEN = 'Фурна 200° · с вентилатор · средна скара';
const BUTTER = 'Извади от хладилника извади маслото · 30 мин преди';

function serveRecipe(recipe: Recipe = roast) {
  server.use(
    http.get(`/api/recipes/${recipe.id}`, () => HttpResponse.json({ recipe })),
  );
}

async function preparationRow() {
  return screen.findByRole('group', { name: 'Подготовка' });
}

describe('Подготовка в Готвене', () => {
  it('чипът е червен, докосването го прави зелен, а новото — пак червен', async () => {
    const user = userEvent.setup();
    setUpDevice('kiosk');
    serveRecipe();

    renderApp(`/recipes/${roast.id}/cook`);
    const row = await preparationRow();
    const chip = within(row).getByRole('button', { name: OVEN });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(within(row).getByRole('button', { name: BUTTER })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await user.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');

    await user.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'false');
  });

  it('когато всички са зелени, редът се свива до „Подготовка ✓“, който се разгъва и прибира', async () => {
    const user = userEvent.setup();
    setUpDevice('kiosk');
    serveRecipe();

    renderApp(`/recipes/${roast.id}/cook`);
    const row = await preparationRow();
    await user.click(within(row).getByRole('button', { name: OVEN }));
    await user.click(within(row).getByRole('button', { name: BUTTER }));

    expect(chipNames(row)).toEqual(['Подготовка']);
    const summary = within(row).getByRole('button', { name: 'Подготовка' });
    expect(summary).toHaveAttribute('aria-expanded', 'false');

    await user.click(summary);
    expect(summary).toHaveAttribute('aria-expanded', 'true');
    expect(chipNames(row)).toEqual(['Подготовка', OVEN, BUTTER]);

    // Червен чип разгръща реда и без обобщението, а последният зелен пак го свива.
    await user.click(within(row).getByRole('button', { name: BUTTER }));
    expect(chipNames(row)).toEqual([OVEN, BUTTER]);
    await user.click(within(row).getByRole('button', { name: BUTTER }));
    expect(chipNames(row)).toEqual(['Подготовка']);
  });

  it('редът е на всяка стъпка', async () => {
    const user = userEvent.setup();
    setUpDevice('kiosk');
    serveRecipe();

    renderApp(`/recipes/${roast.id}/cook`);
    await user.click(
      within(await preparationRow()).getByRole('button', { name: OVEN }),
    );
    await user.click(screen.getByRole('button', { name: 'Напред' }));

    expect(screen.getByText('Стъпка 2 от 2')).toBeInTheDocument();
    expect(
      within(await preparationRow()).getByRole('button', { name: OVEN }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('рецепта без подготовка няма ред', async () => {
    setUpDevice('kiosk');
    serveRecipe({ ...roast, preparation: [] });

    renderApp(`/recipes/${roast.id}/cook`);

    expect(await screen.findByText('Стъпка 1 от 2')).toBeInTheDocument();
    expect(
      screen.queryByRole('group', { name: 'Подготовка' }),
    ).not.toBeInTheDocument();
  });

  it('отметките оцеляват след презареждане същия ден, а след полунощ започват отначало', async () => {
    const user = userEvent.setup();
    setUpDevice('kiosk');
    serveRecipe();
    atTime('2026-10-30T19:00:00+02:00');

    const first = renderApp(`/recipes/${roast.id}/cook`);
    await user.click(
      within(await preparationRow()).getByRole('button', { name: OVEN }),
    );
    first.unmount();

    atTime('2026-10-30T23:50:00+02:00');
    const again = renderApp(`/recipes/${roast.id}/cook`);
    expect(
      within(await preparationRow()).getByRole('button', { name: OVEN }),
    ).toHaveAttribute('aria-pressed', 'true');
    again.unmount();

    atTime('2026-10-31T00:10:00+02:00');
    renderApp(`/recipes/${roast.id}/cook`);
    expect(
      within(await preparationRow()).getByRole('button', { name: OVEN }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('„Готово“ изчиства отметките и същия ден', async () => {
    const user = userEvent.setup();
    setUpDevice('kiosk');
    serveRecipe();

    const first = renderApp(`/recipes/${roast.id}/cook`);
    const row = await preparationRow();
    await user.click(within(row).getByRole('button', { name: OVEN }));
    await user.click(within(row).getByRole('button', { name: BUTTER }));
    await user.click(screen.getByRole('button', { name: 'Напред' }));
    await user.click(screen.getByRole('button', { name: 'Готово' }));
    first.unmount();

    renderApp(`/recipes/${roast.id}/cook`);
    const fresh = await preparationRow();
    expect(within(fresh).getByRole('button', { name: OVEN })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(within(fresh).getByRole('button', { name: BUTTER })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it.each([
    ['махнат елемент', [oven]],
    ['друга фурна', [{ ...oven, degrees: 180 }, butter]],
  ] as const)(
    'отметки от друга подготовка (%s) се четат като празни',
    async (_, preparation) => {
      const user = userEvent.setup();
      setUpDevice('kiosk');
      serveRecipe();

      const first = renderApp(`/recipes/${roast.id}/cook`);
      const row = await preparationRow();
      await user.click(within(row).getByRole('button', { name: OVEN }));
      await user.click(within(row).getByRole('button', { name: BUTTER }));
      first.unmount();

      serveRecipe({ ...roast, preparation: [...preparation] });
      renderApp(`/recipes/${roast.id}/cook`);
      const changed = await preparationRow();
      for (const chip of within(changed).getAllByRole('button')) {
        expect(chip).toHaveAttribute('aria-pressed', 'false');
      }
    },
  );
});

/** Имената на бутоните в реда, по реда им. */
function chipNames(row: HTMLElement) {
  return within(row)
    .getAllByRole('button')
    .map(
      (button) =>
        button.getAttribute('aria-label') ??
        button.textContent?.replace('✓', '').trim(),
    );
}

/** Часовникът показва `iso` (само `Date`; таймерите остават истински). */
function atTime(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
  onTestFinished(() => {
    vi.useRealTimers();
  });
}
