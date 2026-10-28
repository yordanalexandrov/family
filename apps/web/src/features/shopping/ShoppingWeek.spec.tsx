import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextWeek, thisWeek } from '../../test/menu';
import { dani, fixtureNow } from '../../test/msw';
import { pantryItem, servePantry } from '../../test/pantry';
import { renderApp, setUpDevice } from '../../test/render';
import {
  coffee,
  mince,
  oil,
  onions,
  pantryRice,
  pantryShoppingList,
  ranOutMilk,
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
      // Без надпис връзката носи името си в aria-label.
      .map((link) => link.getAttribute('aria-label') ?? link.textContent);
    expect(
      labels.slice(labels.indexOf('Меню'), labels.indexOf('Меню') + 2),
    ).toEqual(['Меню', 'Пазаруване']);
    expect(
      within(nav).getByRole('link', { name: 'Пазаруване' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  describe('килерът', () => {
    it('лентата „🏠 Скрити от килера: N“ се разгъва до скритите редове и води до килера', async () => {
      const user = userEvent.setup();
      serveShopping({ [thisWeek]: pantryShoppingList() });

      renderApp('/shopping');
      const toggle = await screen.findByRole('button', {
        name: '🏠 Скрити от килера: 2',
      });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(
        screen.queryByRole('list', { name: 'Скрити от килера' }),
      ).not.toBeInTheDocument();
      // Лентата води до килера и свита.
      expect(screen.getByRole('link', { name: 'Към килера' })).toHaveAttribute(
        'href',
        '/pantry',
      );
      await user.click(toggle);

      const hidden = screen.getByRole('list', { name: 'Скрити от килера' });
      expect(
        within(hidden)
          .getAllByRole('listitem')
          .map(
            (row) => row.querySelector('.shopping-item__title')?.textContent,
          ),
      ).toEqual(['Ориз', 'Сол']);
      expect(hidden).toHaveTextContent('400 г');
      expect(screen.getByRole('link', { name: 'Към килера' })).toHaveAttribute(
        'href',
        '/pantry',
      );
      expect(screen.queryByRole('checkbox', { name: 'Ориз' })).toBeNull();
    });

    it('„Свърши“ на скрит ред праща POST /api/pantry/:id/ran-out', async () => {
      const user = userEvent.setup();
      serveShopping({ [thisWeek]: pantryShoppingList() });
      const pantry = servePantry([
        pantryItem(
          {
            id: 'c0000000-0000-4000-8000-000000000009',
            name: 'Ориз',
            unit: 'g',
            aisle: 'grains',
          },
          { id: pantryRice.pantry?.id ?? '' },
        ),
      ]);

      renderApp('/shopping');
      await user.click(
        await screen.findByRole('button', { name: '🏠 Скрити от килера: 2' }),
      );
      await user.click(screen.getByRole('button', { name: 'Свърши Ориз' }));

      await vi.waitFor(() =>
        expect(pantry).toEqual([{ method: 'POST', id: pantryRice.pantry?.id }]),
      );
    });

    it('значки: „свърши“ на свършил постоянен, „🏠 в килера — провери“ с бележката на временен', async () => {
      serveShopping({ [thisWeek]: pantryShoppingList() });

      renderApp('/shopping');

      const milk = (
        await screen.findByRole('checkbox', { name: ranOutMilk.title })
      ).closest('li');
      expect(milk).toHaveTextContent('свърши');
      const oilRow = screen
        .getByRole('checkbox', { name: 'Слънчогледово олио' })
        .closest('li');
      expect(oilRow).toHaveTextContent('свърши');
      const minceRow = screen
        .getByRole('checkbox', { name: mince.title })
        .closest('li');
      expect(minceRow).toHaveTextContent('🏠 в килера — провери · фризер');
      expect(minceRow).toHaveTextContent('500 г');
      const tomatoRow = screen
        .getByRole('checkbox', { name: tomatoes.title })
        .closest('li');
      expect(tomatoRow).not.toHaveTextContent('килера');
      expect(tomatoRow).not.toHaveTextContent('свърши');
    });

    it('„Имаме го винаги“ в менюто на реда добавя продукта като постоянен', async () => {
      const user = userEvent.setup();
      serveShopping({ [thisWeek]: pantryShoppingList() });
      const pantry = servePantry();

      renderApp('/shopping');
      await user.click(
        await screen.findByRole('button', { name: 'Домати: от кои ястия' }),
      );
      await user.click(
        within(screen.getByRole('dialog', { name: 'Домати' })).getByRole(
          'button',
          { name: 'Имаме го винаги' },
        ),
      );

      await vi.waitFor(() =>
        expect(pantry).toEqual([
          {
            method: 'POST',
            body: {
              ingredientId: 'c0000000-0000-4000-8000-000000000001',
              kind: 'staple',
              frozen: false,
            },
          },
        ]),
      );
    });

    it('„Имаме го винаги“ на временен продукт го прави постоянен', async () => {
      const user = userEvent.setup();
      serveShopping({ [thisWeek]: pantryShoppingList() });
      const pantry = servePantry();

      renderApp('/shopping');
      await user.click(
        await screen.findByRole('button', { name: 'Кайма: от кои ястия' }),
      );
      await user.click(
        within(screen.getByRole('dialog', { name: 'Кайма' })).getByRole(
          'button',
          { name: 'Имаме го винаги' },
        ),
      );

      await vi.waitFor(() =>
        expect(pantry).toEqual([
          { method: 'PATCH', id: mince.pantry?.id, body: { kind: 'staple' } },
        ]),
      );
    });

    it('постоянен продукт няма „Имаме го винаги“', async () => {
      const user = userEvent.setup();
      serveShopping({ [thisWeek]: pantryShoppingList() });

      renderApp('/shopping');
      await user.click(
        await screen.findByRole('button', {
          name: `${ranOutMilk.title}: от кои ястия`,
        }),
      );

      expect(
        within(screen.getByRole('dialog')).queryByRole('button', {
          name: 'Имаме го винаги',
        }),
      ).not.toBeInTheDocument();
    });

    it('без връзка „Свърши“ и „Имаме го винаги“ са неактивни с подсказка', async () => {
      const user = userEvent.setup();
      serveShopping({ [thisWeek]: pantryShoppingList() });
      renderApp('/shopping');
      await screen.findByRole('button', { name: '🏠 Скрити от килера: 2' });
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      act(() => {
        window.dispatchEvent(new Event('offline'));
      });

      await user.click(
        screen.getByRole('button', { name: '🏠 Скрити от килера: 2' }),
      );
      expect(
        screen.getByRole('button', { name: 'Свърши Ориз' }),
      ).toBeDisabled();
      await user.click(
        screen.getByRole('button', { name: 'Домати: от кои ястия' }),
      );
      const sheet = screen.getByRole('dialog', { name: 'Домати' });
      expect(
        within(sheet).getByRole('button', { name: 'Имаме го винаги' }),
      ).toBeDisabled();
      expect(sheet).toHaveTextContent('Иска връзка');
      expect(screen.getAllByText('Иска връзка').length).toBeGreaterThanOrEqual(
        2,
      );
    });
  });
});
