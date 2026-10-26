import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextWeek, thisWeek } from '../../test/menu';
import { dani, fixtureNow } from '../../test/msw';
import { renderApp, setUpDevice } from '../../test/render';
import {
  coffee,
  oil,
  onions,
  serveShopping,
  shoppingList,
  tomatoes,
} from '../../test/shopping';

/** Заглавията на редовете в щанда, по реда им. */
function rowTitles(aisle: string): string[] {
  const section = screen.getByRole('region', { name: aisle });
  return within(section)
    .getAllByRole('listitem')
    .map(
      (row) =>
        within(row).getByRole('checkbox').getAttribute('aria-label') ?? '',
    );
}

describe('ShoppingWeek', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(fixtureNow);
    setUpDevice('phone', dani.id);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete document.documentElement.dataset.theme;
  });

  // Без layout в jsdom: вариантите проверяват, че екранът се показва цял с всяка тема и ширина; вида — скрийншоти.
  it.each([
    { theme: 'light', device: 'телефон', width: 390 },
    { theme: 'dark', device: 'телефон', width: 390 },
    { theme: 'light', device: 'таблет', width: 1024 },
    { theme: 'dark', device: 'таблет', width: 1024 },
  ])(
    '$theme тема, $device ($width px): списъкът се показва',
    async ({ theme, width }) => {
      localStorage.setItem('family.theme', theme);
      vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(width);
      serveShopping({ [thisWeek]: shoppingList() });

      renderApp('/shopping');

      expect(await screen.findByText('5 от 6')).toBeInTheDocument();
      expect(document.documentElement.dataset.theme).toBe(theme);
      expect(
        screen.getByRole('region', { name: 'Плод и зеленчук' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('checkbox', { name: 'Кафе' }),
      ).toBeInTheDocument();
    },
  );

  it('седмица без меню: „Няма меню за тази седмица“ с линк към менюто', async () => {
    serveShopping();

    renderApp('/shopping');

    expect(
      await screen.findByText('Няма меню за тази седмица'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Към менюто' })).toHaveAttribute(
      'href',
      '/menu',
    );
    expect(screen.getByRole('tab', { name: 'Тази седмица' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('списък: щандовете в реда на api-то, редове с количество и единица, брояч', async () => {
    serveShopping({ [thisWeek]: shoppingList() });

    renderApp('/shopping');

    expect(await screen.findByText('5 от 6')).toBeInTheDocument();
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent),
    ).toEqual([
      'Плод и зеленчук',
      'Млечни и яйца',
      'Подправки, сосове и бакалия',
      'Друго',
    ]);
    expect(rowTitles('Плод и зеленчук')).toEqual(['Домати', 'Лук', 'Чушки']);
    const rows = within(
      screen.getByRole('region', { name: 'Плод и зеленчук' }),
    ).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('500 г');
    expect(rows[1]).toHaveTextContent('2 бр.');
    expect(rows[2]).toHaveTextContent('3 бр.');
    const peppersRow = rows[2] as HTMLElement;
    expect(within(peppersRow).getByRole('checkbox')).toBeChecked();
    expect(
      within(peppersRow).getByTitle('Отметнато от Дани'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Млечни и яйца' }),
    ).toHaveTextContent('1000 мл');
    const salt = within(
      screen.getByRole('region', { name: 'Подправки, сосове и бакалия' }),
    ).getByRole('listitem');
    expect(salt).toHaveTextContent('по вкус');
    const coffeeRow = within(
      screen.getByRole('region', { name: 'Друго' }),
    ).getByRole('listitem');
    expect(coffeeRow).toHaveTextContent('2 бр.');
    expect(
      within(coffeeRow).getByRole('img', { name: 'добавен на ръка' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Олио')).not.toBeInTheDocument();
  });

  it('отметка праща PUT …/checked с действащия потребител и мести реда в края на щанда', async () => {
    const user = userEvent.setup();
    const shopping = serveShopping({ [thisWeek]: shoppingList() });

    renderApp('/shopping');
    await user.click(await screen.findByRole('checkbox', { name: 'Домати' }));

    expect(screen.getByRole('checkbox', { name: 'Домати' })).toBeChecked();
    expect(rowTitles('Плод и зеленчук')).toEqual(['Лук', 'Домати', 'Чушки']);
    expect(await screen.findByText('4 от 6')).toBeInTheDocument();
    await vi.waitFor(() =>
      expect(shopping.requests).toEqual([
        {
          method: 'PUT',
          path: `${thisWeek}/items/${tomatoes.key}/checked`,
          body: { checked: true },
          actingUser: dani.id,
        },
      ]),
    );
  });

  it('разотметка праща checked: false и връща реда при неотметнатите', async () => {
    const user = userEvent.setup();
    const shopping = serveShopping({ [thisWeek]: shoppingList() });

    renderApp('/shopping');
    await user.click(await screen.findByRole('checkbox', { name: 'Чушки' }));

    expect(rowTitles('Плод и зеленчук')).toEqual(['Домати', 'Лук', 'Чушки']);
    expect(await screen.findByText('6 от 6')).toBeInTheDocument();
    await vi.waitFor(() =>
      expect(shopping.requests.map((r) => r.body)).toEqual([
        { checked: false },
      ]),
    );
  });

  it('„+ Добави“ праща POST с ръчния ред; празно заглавие не се праща', async () => {
    const user = userEvent.setup();
    const shopping = serveShopping({ [thisWeek]: shoppingList() });

    renderApp('/shopping');
    await user.click(await screen.findByRole('button', { name: '+ Добави' }));
    const sheet = screen.getByRole('dialog', { name: 'Добави' });
    await user.click(within(sheet).getByRole('button', { name: 'Добави' }));
    expect(
      within(sheet).getByText('Въведи заглавие до 60 знака'),
    ).toBeInTheDocument();

    await user.type(
      within(sheet).getByLabelText('Заглавие'),
      '  тоалетна хартия ',
    );
    await user.type(within(sheet).getByLabelText('Количество'), '2');
    await user.selectOptions(within(sheet).getByLabelText('Единица'), 'бр.');
    await user.selectOptions(within(sheet).getByLabelText('Щанд'), 'Друго');
    await user.click(within(sheet).getByRole('button', { name: 'Добави' }));

    await vi.waitFor(() =>
      expect(shopping.requests).toEqual([
        {
          method: 'POST',
          path: `${thisWeek}/items`,
          body: {
            title: 'тоалетна хартия',
            quantity: 2,
            unit: 'pcs',
            aisle: 'other',
          },
          actingUser: dani.id,
        },
      ]),
    );
    await vi.waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('„скрий“ на изчислен ред праща PUT …/hidden', async () => {
    const user = userEvent.setup();
    const shopping = serveShopping({ [thisWeek]: shoppingList() });

    renderApp('/shopping');
    await user.click(await screen.findByRole('button', { name: 'Скрий Лук' }));

    await vi.waitFor(() =>
      expect(shopping.requests).toEqual([
        {
          method: 'PUT',
          path: `${thisWeek}/items/${onions.key}/hidden`,
          body: { hidden: true },
          actingUser: dani.id,
        },
      ]),
    );
    expect(
      screen.queryByRole('button', { name: 'Скрий Кафе' }),
    ).not.toBeInTheDocument();
  });

  it('скритата секция се разгъва и „покажи“ праща hidden: false', async () => {
    const user = userEvent.setup();
    const shopping = serveShopping({ [thisWeek]: shoppingList() });

    renderApp('/shopping');
    const toggle = await screen.findByRole('button', { name: 'Скрити (1)' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);

    const hidden = screen.getByRole('list', { name: 'Скрити' });
    expect(hidden).toHaveTextContent('Олио');
    expect(hidden).toHaveTextContent('50 мл');
    await user.click(
      within(hidden).getByRole('button', { name: 'Покажи Олио' }),
    );
    await vi.waitFor(() =>
      expect(shopping.requests).toEqual([
        expect.objectContaining({
          path: `${thisWeek}/items/${oil.key}/hidden`,
          body: { hidden: false },
        }),
      ]),
    );
  });

  it('докосване на заглавието отваря „от кои ястия“ с деня и рецептата', async () => {
    const user = userEvent.setup();
    serveShopping({ [thisWeek]: shoppingList() });

    renderApp('/shopping');
    await user.click(
      await screen.findByRole('button', { name: 'Домати: от кои ястия' }),
    );

    const sheet = screen.getByRole('dialog', { name: 'Домати' });
    const sources = within(sheet).getAllByRole('listitem');
    expect(sources).toHaveLength(2);
    expect(sources[0]).toHaveTextContent('понеделник, 2 ноември · Пиле с ориз');
    expect(sources[1]).toHaveTextContent(
      'петък, 6 ноември · Паста с доматен сос',
    );
  });

  it('„изтрий“ на ръчен ред иска потвърждение и праща DELETE', async () => {
    const user = userEvent.setup();
    const shopping = serveShopping({ [thisWeek]: shoppingList() });

    renderApp('/shopping');
    await user.click(
      await screen.findByRole('button', { name: 'Изтрий Кафе' }),
    );
    expect(shopping.requests).toEqual([]);
    const confirm = screen.getByRole('alertdialog', {
      name: 'Изтриване на Кафе',
    });
    await user.click(within(confirm).getByRole('button', { name: 'Изтрий' }));

    await vi.waitFor(() =>
      expect(shopping.requests).toEqual([
        expect.objectContaining({
          method: 'DELETE',
          path: `${thisWeek}/items/${coffee.key}`,
        }),
      ]),
    );
  });

  it('„Следваща седмица“ чете списъка на следващия понеделник', async () => {
    const user = userEvent.setup();
    const shopping = serveShopping({ [thisWeek]: shoppingList() });

    renderApp('/shopping');
    await screen.findByText('5 от 6');
    await user.click(screen.getByRole('tab', { name: 'Следваща седмица' }));

    expect(
      await screen.findByText('Няма меню за тази седмица'),
    ).toBeInTheDocument();
    expect(shopping.gets).toContain(nextWeek);
  });

  it('„Пазаруване“ е в долната навигация след „Меню“', async () => {
    serveShopping();

    renderApp('/shopping');

    const nav = await screen.findByRole('navigation', {
      name: 'Основна навигация',
    });
    const labels = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(
      labels.slice(labels.indexOf('Меню'), labels.indexOf('Меню') + 2),
    ).toEqual(['Меню', 'Пазаруване']);
    expect(
      within(nav).getByRole('link', { name: 'Пазаруване' }),
    ).toHaveAttribute('aria-current', 'page');
  });
});
