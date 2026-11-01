import { type ShoppingList, withCheck } from '@family/shared';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http } from 'msw';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from 'vitest';
import { nextWeek, thisWeek } from '../../test/menu';
import { dani, fixtureNow, poli, server } from '../../test/msw';
import { pantryItem, servePantry } from '../../test/pantry';
import { renderApp, setUpDevice } from '../../test/render';
import {
  coffee,
  mince,
  oil,
  onions,
  pantryRice,
  pantryShoppingList,
  peppers,
  ranOutMilk,
  serveShopping,
  shoppingList,
  tomatoes,
  withMenu,
} from '../../test/shopping';
import { UNSENT_AFTER_MS } from './sync';

/** Заглавията на редовете в щанда, по реда им. */
function rowTitles(
  aisle: string,
  scope: HTMLElement = document.body,
): string[] {
  const section = within(scope).getAllByRole('region', { name: aisle })[0];
  if (!section) throw new Error(`няма щанд ${aisle}`);
  return within(section)
    .getAllByRole('listitem')
    .map(
      (row) =>
        within(row).getByRole('checkbox').getAttribute('aria-label') ?? '',
    );
}

/** Разгъва „Купени (N)“ и връща секцията му. */
async function openBought(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /^Купени \(/ }));
  return screen.getByRole('region', { name: 'Купени' });
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

  it('седмица без меню (#129 D-11): празен списък с „+ Добави“, подсказка и линк към менюто', async () => {
    serveShopping();

    renderApp('/shopping');

    expect(
      await screen.findByText('Когато има меню, добави ястия от него'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '+ Добави' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Към менюто' })).toHaveAttribute(
      'href',
      '/menu',
    );
    expect(screen.queryByText(/за купуване/)).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Тази седмица' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('меню без ястия в списъка (ADR-0011): „Добави ястия от менюто“ и линк към менюто', async () => {
    serveShopping({ [thisWeek]: withMenu(thisWeek) });

    renderApp('/shopping');

    expect(
      await screen.findByText('Добави ястия от менюто'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Към менюто' })).toHaveAttribute(
      'href',
      '/menu',
    );
    expect(screen.queryByText('Списъкът е празен.')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Когато има меню, добави ястия от него'),
    ).not.toBeInTheDocument();
  });

  it('ястия в списъка, но всички редове скрити: „Списъкът е празен.“ без подсказка за менюто', async () => {
    serveShopping({
      [thisWeek]: {
        ...withMenu(thisWeek, [onions.sources[0]?.mealId ?? '']),
        hidden: [oil],
      },
    });

    renderApp('/shopping');

    expect(await screen.findByText('Списъкът е празен.')).toBeInTheDocument();
    expect(
      screen.queryByText('Добави ястия от менюто'),
    ).not.toBeInTheDocument();
  });

  it('седмица без меню: ръчен ред се добавя и се вижда в списъка, подсказката остава', async () => {
    const user = userEvent.setup();
    const shopping = serveShopping();

    renderApp('/shopping');
    await user.click(await screen.findByRole('button', { name: '+ Добави' }));
    const sheet = screen.getByRole('dialog', { name: 'Добави' });
    await user.type(within(sheet).getByLabelText('Заглавие'), 'кафе');
    await user.click(within(sheet).getByRole('button', { name: 'Добави' }));

    expect(
      await screen.findByRole('checkbox', { name: 'кафе' }),
    ).toBeInTheDocument();
    expect(shopping.requests).toMatchObject([
      { method: 'POST', path: `${thisWeek}/items`, body: { title: 'кафе' } },
    ]);
    expect(screen.getByText('1 от 1')).toBeInTheDocument();
    expect(
      screen.getByText('Когато има меню, добави ястия от него'),
    ).toBeInTheDocument();
  });

  it('списък: щандовете в реда на api-то, редове с количество и единица, брояч', async () => {
    const user = userEvent.setup();
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
    expect(rowTitles('Плод и зеленчук')).toEqual(['Домати', 'Лук']);
    const rows = within(
      screen.getByRole('region', { name: 'Плод и зеленчук' }),
    ).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('500 г');
    expect(rows[1]).toHaveTextContent('2 бр. + 750 г');
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
    const bought = await openBought(user);
    const peppersRow = within(bought).getByRole('listitem');
    expect(peppersRow).toHaveTextContent('3 бр.');
    expect(within(peppersRow).getByRole('checkbox')).toBeChecked();
    expect(
      within(peppersRow).getByTitle('Отметнато от Дани'),
    ).toBeInTheDocument();
  });

  it('щандът с лентата си остава секция със заглавие с пълното си име, и в „Купени“ (#308)', async () => {
    const user = userEvent.setup();
    serveShopping({ [thisWeek]: shoppingList() });

    renderApp('/shopping');

    const spices = await screen.findByRole('region', {
      name: 'Подправки, сосове и бакалия',
    });
    expect(
      within(spices).getByRole('heading', {
        level: 2,
        name: 'Подправки, сосове и бакалия',
      }),
    ).toBeInTheDocument();
    const bought = await openBought(user);
    const produce = within(bought).getByRole('region', {
      name: 'Плод и зеленчук',
    });
    expect(
      within(produce).getByRole('heading', {
        level: 3,
        name: 'Плод и зеленчук',
      }),
    ).toBeInTheDocument();
  });

  it('отметка праща PUT …/checked с действащия потребител', async () => {
    const user = userEvent.setup();
    const shopping = serveShopping({ [thisWeek]: shoppingList() });

    renderApp('/shopping');
    await user.click(await screen.findByRole('checkbox', { name: 'Домати' }));

    expect(screen.getByRole('checkbox', { name: 'Домати' })).toBeChecked();
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

  it('онлайн отметка с латентност 400 ms не слага брой на иконата за синхронизация (#207, #208)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(fixtureNow);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    serveShopping({ [thisWeek]: shoppingList() });
    server.use(
      http.put(
        '/api/shopping-lists/:weekStart/items/:key/checked',
        async () => {
          await delay(400);
          return undefined;
        },
      ),
    );

    renderApp('/shopping');
    await user.click(await screen.findByRole('checkbox', { name: 'Домати' }));
    for (let ms = 0; ms < 2000; ms += 50) {
      await act(() => vi.advanceTimersByTimeAsync(50));
      expect(
        screen.getByRole('button', { name: 'Всички отметки са изпратени' }),
      ).toHaveTextContent('');
    }
  });

  it('бавна онлайн отметка: броят на иконата идва чак след прага и пада, когато отметката стигне (#207)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(fixtureNow);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    serveShopping({ [thisWeek]: shoppingList() });
    server.use(
      http.put(
        '/api/shopping-lists/:weekStart/items/:key/checked',
        async () => {
          await delay(2000);
          return undefined;
        },
      ),
    );
    // Часовникът върви на стъпки по 50 ms, всяка в свой `act`: таймер, пуснат от ефект по средата, тръгва навреме.
    const advance = async (ms: number) => {
      for (let passed = 0; passed < ms; passed += 50) {
        await act(() => vi.advanceTimersByTimeAsync(Math.min(50, ms - passed)));
      }
    };

    renderApp('/shopping');
    await user.click(await screen.findByRole('checkbox', { name: 'Домати' }));
    await advance(UNSENT_AFTER_MS - 100);
    expect(
      screen.getByRole('button', { name: 'Всички отметки са изпратени' }),
    ).toHaveTextContent('');

    await advance(200);
    expect(
      screen.getByRole('button', { name: '1 отметка чака връзка' }),
    ).toHaveTextContent('1');

    await advance(2000);
    expect(
      screen.getByRole('button', { name: 'Всички отметки са изпратени' }),
    ).toHaveTextContent('');
  });

  describe('Купени (#306)', () => {
    it('отметнатият ред стои задраскан на мястото си и излиза в „Купени (N)“ 1.5 s след последното докосване; броячът не се сменя', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(fixtureNow);
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      serveShopping({ [thisWeek]: shoppingList() });

      renderApp('/shopping');
      expect(
        await screen.findByRole('button', { name: 'Купени (1)' }),
      ).toHaveAttribute('aria-expanded', 'false');
      await user.click(screen.getByText('Домати'));
      expect(await screen.findByText('4 от 6')).toBeInTheDocument();
      expect(rowTitles('Плод и зеленчук')).toEqual(['Домати', 'Лук']);

      await act(() => vi.advanceTimersByTimeAsync(1000));
      // Докосване другаде в списъка отлага местенето.
      await user.pointer({
        keys: '[MouseLeft>]',
        target: screen.getByText('Лук'),
      });
      await act(() => vi.advanceTimersByTimeAsync(1000));
      expect(rowTitles('Плод и зеленчук')).toEqual(['Домати', 'Лук']);

      await act(() => vi.advanceTimersByTimeAsync(600));
      expect(rowTitles('Плод и зеленчук')).toEqual(['Лук']);
      expect(screen.getByText('4 от 6')).toBeInTheDocument();
      const bought = await openBought(user);
      expect(rowTitles('Плод и зеленчук', bought)).toEqual(['Домати', 'Чушки']);
    });

    it('„Купени“ е под списъка и над „Скрити“, с редовете по щанд', async () => {
      const user = userEvent.setup();
      serveShopping({ [thisWeek]: shoppingList() });

      renderApp('/shopping');
      await screen.findByText('5 от 6');
      expect(rowTitles('Плод и зеленчук')).toEqual(['Домати', 'Лук']);
      const bought = await openBought(user);

      expect(
        within(bought)
          .getAllByRole('region')
          .map((r) => r.getAttribute('aria-label')),
      ).toEqual(['Плод и зеленчук']);
      expect(
        within(bought).getByRole('checkbox', { name: 'Чушки' }),
      ).toBeChecked();
      const lastAisle = screen.getByRole('region', { name: 'Друго' });
      const hidden = screen.getByRole('button', { name: 'Скрити (1)' });
      expect(lastAisle.compareDocumentPosition(bought)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
      expect(bought.compareDocumentPosition(hidden)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });

    it('махане на отметка в „Купени“ връща реда в щанда му', async () => {
      const user = userEvent.setup();
      const shopping = serveShopping({ [thisWeek]: shoppingList() });

      renderApp('/shopping');
      await screen.findByText('5 от 6');
      const bought = await openBought(user);
      await user.click(within(bought).getByRole('checkbox', { name: 'Чушки' }));

      expect(await screen.findByText('6 от 6')).toBeInTheDocument();
      expect(rowTitles('Плод и зеленчук')).toEqual(['Домати', 'Лук', 'Чушки']);
      expect(
        screen.queryByRole('button', { name: /^Купени/ }),
      ).not.toBeInTheDocument();
      await vi.waitFor(() =>
        expect(shopping.requests.map((r) => r.body)).toEqual([
          { checked: false },
        ]),
      );

      // Нова отметка веднага след това: редът стои задраскан в щанда, докато не мине задържането.
      await user.click(screen.getByRole('checkbox', { name: 'Чушки' }));
      expect(await screen.findByText('5 от 6')).toBeInTheDocument();
      expect(rowTitles('Плод и зеленчук')).toEqual(['Домати', 'Лук', 'Чушки']);
    });

    it('отметнат свършил постоянен продукт е в „Купени“, не в „Скрити от килера“', async () => {
      const user = userEvent.setup();
      const list = pantryShoppingList();
      serveShopping({
        [thisWeek]: withCheck(list, ranOutMilk.key, {
          checkedBy: dani.id,
          checkedAt: '2026-11-04T08:00:00.000Z',
        }),
      });

      renderApp('/shopping');
      const bought = await openBought(user);

      expect(
        within(bought).getByRole('checkbox', { name: ranOutMilk.title }),
      ).toBeChecked();
      expect(
        screen.getAllByRole('checkbox', { name: ranOutMilk.title }),
      ).toHaveLength(1);
    });
  });

  it('докосване на името отмята реда и не отваря листа', async () => {
    const user = userEvent.setup();
    const shopping = serveShopping({ [thisWeek]: shoppingList() });

    renderApp('/shopping');
    await user.click(await screen.findByText('Домати'));

    expect(screen.getByRole('checkbox', { name: 'Домати' })).toBeChecked();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await vi.waitFor(() =>
      expect(shopping.requests.map((r) => r.body)).toEqual([{ checked: true }]),
    );
  });

  describe('чужда отметка (#129 D-04)', () => {
    beforeEach(() => setUpDevice('phone', poli.id));

    it('първото докосване пита „Дани го взе. Махни отметката?“ и не праща нищо; „Махни“ я маха', async () => {
      const user = userEvent.setup();
      const shopping = serveShopping({ [thisWeek]: shoppingList() });

      renderApp('/shopping');
      // Отметнатото от Дани е в „Купени“ (#306).
      await openBought(user);
      await user.click(screen.getByRole('checkbox', { name: 'Чушки' }));

      const row = screen.getByRole('checkbox', { name: 'Чушки' }).closest('li');
      expect(row).not.toBeNull();
      expect(row).toHaveTextContent('Дани го взе. Махни отметката?');
      expect(screen.getByRole('checkbox', { name: 'Чушки' })).toBeChecked();
      expect(shopping.requests).toEqual([]);

      await user.click(
        within(row as HTMLElement).getByRole('button', { name: 'Махни' }),
      );

      expect(screen.getByRole('checkbox', { name: 'Чушки' })).not.toBeChecked();
      expect(await screen.findByText('6 от 6')).toBeInTheDocument();
      await vi.waitFor(() =>
        expect(shopping.requests).toEqual([
          {
            method: 'PUT',
            path: `${thisWeek}/items/${peppers.key}/checked`,
            body: { checked: false },
            actingUser: poli.id,
          },
        ]),
      );
    });

    it('след „Махни“ toast „Махна отметката на Дани · Върни“; „Върни“ праща пак checked: true', async () => {
      const user = userEvent.setup();
      const shopping = serveShopping({ [thisWeek]: shoppingList() });

      renderApp('/shopping');
      await openBought(user);
      await user.click(screen.getByText('Чушки'));
      await user.click(screen.getByRole('button', { name: 'Махни' }));

      expect(
        await screen.findByText('Махна отметката на Дани'),
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Върни' }));

      expect(screen.getByRole('checkbox', { name: 'Чушки' })).toBeChecked();
      expect(await screen.findByText('5 от 6')).toBeInTheDocument();
      await vi.waitFor(() =>
        expect(shopping.requests.map((r) => [r.body, r.actingUser])).toEqual([
          [{ checked: false }, poli.id],
          [{ checked: true }, poli.id],
        ]),
      );
      expect(screen.queryByText('Махна отметката на Дани')).toBeNull();
    });

    it('ред, вече отметнат от Дани на сървъра, остава с неговия аватар веднага след отговора', async () => {
      const user = userEvent.setup();
      const shopping = serveShopping({ [thisWeek]: shoppingList() });

      renderApp('/shopping');
      await screen.findByText('5 от 6');
      shopping.lists[thisWeek] = withCheck(
        shopping.lists[thisWeek] as ShoppingList,
        tomatoes.key,
        { checkedBy: dani.id, checkedAt: '2026-11-04T08:10:00.000Z' },
      );
      const gets = shopping.gets.length;
      await user.click(screen.getByText('Домати'));

      const row = screen
        .getByRole('checkbox', { name: 'Домати' })
        .closest('li');
      expect(
        await within(row as HTMLElement).findByTitle('Отметнато от Дани'),
      ).toBeInTheDocument();
      expect(shopping.gets.length).toBe(gets + 1);
      expect(shopping.requests.map((r) => r.body)).toEqual([{ checked: true }]);
    });

    it('второ докосване на реда затваря въпроса, без да праща', async () => {
      const user = userEvent.setup();
      const shopping = serveShopping({ [thisWeek]: shoppingList() });

      renderApp('/shopping');
      await openBought(user);
      await user.click(screen.getByText('Чушки'));
      await user.click(screen.getByText('Чушки'));

      expect(screen.queryByRole('button', { name: 'Махни' })).toBeNull();
      expect(screen.getByRole('checkbox', { name: 'Чушки' })).toBeChecked();
      expect(shopping.requests).toEqual([]);
    });

    it('своята отметка се маха с едно докосване, без въпрос', async () => {
      const user = userEvent.setup();
      const shopping = serveShopping({ [thisWeek]: shoppingList() });

      renderApp('/shopping');
      await user.click(await screen.findByText('Домати'));
      expect(await screen.findByText('4 от 6')).toBeInTheDocument();
      await user.click(screen.getByText('Домати'));

      expect(screen.queryByRole('button', { name: 'Махни' })).toBeNull();
      expect(await screen.findByText('5 от 6')).toBeInTheDocument();
      await vi.waitFor(() =>
        expect(shopping.requests.map((r) => r.body)).toEqual([
          { checked: true },
          { checked: false },
        ]),
      );
    });
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

  describe('новодобавен ред (#307)', () => {
    async function addBread(user: ReturnType<typeof userEvent.setup>) {
      await user.click(await screen.findByRole('button', { name: '+ Добави' }));
      const sheet = screen.getByRole('dialog', { name: 'Добави' });
      await user.type(within(sheet).getByLabelText('Заглавие'), 'хляб');
      await user.click(within(sheet).getByRole('button', { name: 'Добави' }));
      return screen.findByRole('checkbox', { name: 'хляб' });
    }

    it('след „+ Добави“ списъкът превърта плавно до новия ред и го отбелязва като нов за около 2 s', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(fixtureNow);
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const scrollIntoView = vi
        .spyOn(Element.prototype, 'scrollIntoView')
        .mockImplementation(() => {});
      serveShopping({ [thisWeek]: shoppingList() });

      renderApp('/shopping');
      const bread = await addBread(user);

      const row = bread.closest('li');
      await vi.waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
      expect(scrollIntoView.mock.contexts[0]).toBe(row);
      expect(scrollIntoView).toHaveBeenCalledWith(
        expect.objectContaining({ behavior: 'smooth' }),
      );
      expect(bread).toHaveAccessibleDescription('току-що добавен');
      expect(
        screen.getByRole('checkbox', { name: 'Домати' }),
      ).not.toHaveAccessibleDescription();

      await act(() => vi.advanceTimersByTimeAsync(2100));
      expect(
        screen.getByRole('checkbox', { name: 'хляб' }),
      ).not.toHaveAccessibleDescription();
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
    });

    it('при prefers-reduced-motion превъртането не е плавно', async () => {
      const user = userEvent.setup();
      const scrollIntoView = vi
        .spyOn(Element.prototype, 'scrollIntoView')
        .mockImplementation(() => {});
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }));
      onTestFinished(() => {
        vi.unstubAllGlobals();
      });
      serveShopping({ [thisWeek]: shoppingList() });

      renderApp('/shopping');
      await addBread(user);

      await vi.waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
      expect(scrollIntoView).toHaveBeenCalledWith(
        expect.objectContaining({ behavior: 'auto' }),
      );
    });
  });

  it('датите на седмицата и броячът са един ред: „2–8 ноем · 5 от 6 за купуване“', async () => {
    serveShopping({ [thisWeek]: shoppingList() });

    renderApp('/shopping');

    const count = (await screen.findByText('5 от 6')).closest('p');
    expect(count).toHaveTextContent(/^2–8 ноем · 5 от 6 за купуване/);
  });

  it('седмица без редове: датите стоят сами, без брояч', async () => {
    serveShopping();

    renderApp('/shopping');

    expect(await screen.findByText('2–8 ноем')).toBeInTheDocument();
    expect(screen.queryByText(/за купуване/)).not.toBeInTheDocument();
  });

  it('„Скрий от списъка“ в листа на изчислен ред праща PUT …/hidden и затваря листа', async () => {
    const user = userEvent.setup();
    const shopping = serveShopping({ [thisWeek]: shoppingList() });

    renderApp('/shopping');
    await user.click(await screen.findByRole('button', { name: 'Още за Лук' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Лук' })).getByRole('button', {
        name: 'Скрий от списъка',
      }),
    );

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
    await vi.waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('„Скрий от списъка“ показва toast „Скри „Лук“ от списъка · Върни“; „Върни“ праща hidden: false', async () => {
    const user = userEvent.setup();
    const shopping = serveShopping({ [thisWeek]: shoppingList() });

    renderApp('/shopping');
    await user.click(await screen.findByRole('button', { name: 'Още за Лук' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Лук' })).getByRole('button', {
        name: 'Скрий от списъка',
      }),
    );

    expect(
      await screen.findByText('Скри „Лук“ от списъка'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Върни' }));

    await vi.waitFor(() =>
      expect(shopping.requests.map((r) => [r.path, r.body])).toEqual([
        [`${thisWeek}/items/${onions.key}/hidden`, { hidden: true }],
        [`${thisWeek}/items/${onions.key}/hidden`, { hidden: false }],
      ]),
    );
    expect(screen.queryByText('Скри „Лук“ от списъка')).toBeNull();
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

  it('ⓘ отваря листа с „от кои ястия“ и „Скрий от списъка“, без да отмята', async () => {
    const user = userEvent.setup();
    const shopping = serveShopping({ [thisWeek]: shoppingList() });

    renderApp('/shopping');
    await user.click(
      await screen.findByRole('button', { name: 'Още за Домати' }),
    );

    const sheet = screen.getByRole('dialog', { name: 'Домати' });
    expect(within(sheet).getByText('От кои ястия')).toBeInTheDocument();
    const sources = within(sheet).getAllByRole('listitem');
    expect(sources).toHaveLength(2);
    expect(sources[0]).toHaveTextContent('понеделник, 2 ноември · Пиле с ориз');
    expect(sources[1]).toHaveTextContent(
      'петък, 6 ноември · Паста с доматен сос',
    );
    expect(
      within(sheet).getByRole('button', { name: 'Скрий от списъка' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Домати' })).not.toBeChecked();
    expect(shopping.requests).toEqual([]);
  });

  it('продукт в две мерни единици: един ред с една отметка, а листът казва кое ястие колко иска', async () => {
    const user = userEvent.setup();
    serveShopping({ [thisWeek]: shoppingList() });

    renderApp('/shopping');
    expect(
      await screen.findByRole('checkbox', { name: 'Лук' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Още за Лук' }));

    const sources = within(
      screen.getByRole('dialog', { name: 'Лук' }),
    ).getAllByRole('listitem');
    expect(sources.map((source) => source.textContent)).toEqual([
      'понеделник, 2 ноември · Пиле с ориз · 2 бр.',
      'четвъртък, 5 ноември · Лучена супа · 750 г + по вкус',
    ]);
  });

  it('„Изтрий“ в листа на ръчен ред праща DELETE без потвърждение; „Върни“ го добавя пак', async () => {
    const user = userEvent.setup();
    const shopping = serveShopping({ [thisWeek]: shoppingList() });

    renderApp('/shopping');
    await user.click(
      await screen.findByRole('button', { name: 'Още за Кафе' }),
    );
    const sheet = screen.getByRole('dialog', { name: 'Кафе' });
    expect(
      within(sheet).queryByRole('button', { name: 'Скрий от списъка' }),
    ).not.toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Изтрий' }));

    await vi.waitFor(() =>
      expect(shopping.requests).toEqual([
        expect.objectContaining({
          method: 'DELETE',
          path: `${thisWeek}/items/${coffee.key}`,
        }),
      ]),
    );
    await vi.waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Изтри „Кафе“ от списъка')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Върни' }));

    await vi.waitFor(() =>
      expect(shopping.requests.slice(1)).toEqual([
        expect.objectContaining({
          method: 'POST',
          path: `${thisWeek}/items`,
          body: { title: 'Кафе', quantity: 2, unit: 'pcs', aisle: 'other' },
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
      await screen.findByText('Когато има меню, добави ястия от него'),
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

    it('„Свърши“ на скрит ред праща POST /api/pantry/:id/ran-out и казва, че продуктът е в списъка', async () => {
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
      expect(
        await screen.findByText('Ориз е добавено в списъка'),
      ).toBeInTheDocument();
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
        await screen.findByRole('button', { name: 'Още за Домати' }),
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
        await screen.findByRole('button', { name: 'Още за Кайма' }),
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
          name: `Още за ${ranOutMilk.title}`,
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
      const ranOut = screen.getByRole('button', { name: 'Свърши Ориз' });
      expect(ranOut).toBeDisabled();
      expect(ranOut).toHaveAccessibleDescription('Иска връзка');
      await user.click(screen.getByRole('button', { name: 'Още за Домати' }));
      const sheet = screen.getByRole('dialog', { name: 'Домати' });
      const alwaysHave = within(sheet).getByRole('button', {
        name: 'Имаме го винаги',
      });
      expect(alwaysHave).toBeDisabled();
      expect(alwaysHave).toHaveAccessibleDescription('Иска връзка');
    });
  });
});
