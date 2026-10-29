import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dani, fixtureNow, server } from '../../test/msw';
import {
  cheese,
  mince,
  oil,
  pantryItem,
  rice,
  salt,
  servePantry,
} from '../../test/pantry';
import { renderApp, setUpDevice } from '../../test/render';

/** Имената на продуктите в групата, по реда им. */
function names(group: string): string[] {
  const section = screen.getByRole('region', { name: group });
  return within(section)
    .queryAllByRole('listitem')
    .map((row) => row.querySelector('.pantry-item__name')?.textContent ?? '');
}

describe('PantryScreen', () => {
  beforeEach(() => {
    // Само `Date`: истинските таймери оставят msw и userEvent да вървят.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(fixtureNow);
    setUpDevice('phone', dani.id);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    // react-query помни `offline` от теста без връзка; връзката се връща и за следващия.
    window.dispatchEvent(new Event('online'));
    delete document.documentElement.dataset.theme;
  });

  it.each(['light', 'dark'])(
    '%s тема: „Килер“ от навигацията на телефона води до екрана',
    async (theme) => {
      localStorage.setItem('family.theme', theme);
      const user = userEvent.setup();
      servePantry([pantryItem(rice)]);

      renderApp('/menu');
      const nav = await screen.findByRole('navigation', {
        name: 'Основна навигация',
      });
      await user.click(within(nav).getByRole('link', { name: 'Килер' }));

      expect(
        await screen.findByRole('heading', { name: 'Килер' }),
      ).toBeInTheDocument();
      expect(await screen.findByText('ориз')).toBeInTheDocument();
      expect(document.documentElement.dataset.theme).toBe(theme);
    },
  );

  it('две групи: постоянните по име, временните от най-старите, с бележката и възрастта', async () => {
    servePantry([
      pantryItem(salt),
      pantryItem(cheese, {
        kind: 'use_up',
        createdAt: '2026-11-03T18:00:00.000Z',
      }),
      pantryItem(rice),
      pantryItem(mince, {
        kind: 'use_up',
        note: 'фризер, ~500 г',
        // 23 октомври в София: 12 дни преди 4 ноември.
        createdAt: '2026-10-23T09:00:00.000Z',
      }),
    ]);

    renderApp('/pantry');

    await screen.findByText('кайма');
    expect(names('Постоянни')).toEqual(['ориз', 'сол']);
    expect(names('Временни')).toEqual(['кайма', 'сирене']);
    const [minceRow, cheeseRow] = within(
      screen.getByRole('region', { name: 'Временни' }),
    ).getAllByRole('listitem');
    expect(minceRow).toHaveTextContent('фризер, ~500 г');
    expect(minceRow).toHaveTextContent('от 12 дни');
    expect(cheeseRow).toHaveTextContent('от 1 ден');
  });

  it('празен килер: двете групи казват, че са празни', async () => {
    servePantry();

    renderApp('/pantry');

    expect(
      await screen.findByText('Няма постоянни продукти.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Няма временни продукти.')).toBeInTheDocument();
  });

  it('„Добави“: два продукта наведнъж като временни с обща бележка', async () => {
    const user = userEvent.setup();
    const requests = servePantry([pantryItem(rice)]);

    renderApp('/pantry');
    await screen.findByText('ориз');
    await user.click(screen.getByRole('button', { name: 'Добави' }));
    const sheet = screen.getByRole('dialog', { name: 'Добави в килера' });
    const search = within(sheet).getByRole('searchbox', {
      name: 'Търси продукт',
    });
    await user.type(search, 'кайма');
    await user.click(
      await within(sheet).findByRole('checkbox', { name: 'кайма' }),
    );
    await user.clear(search);
    await user.type(search, 'сирене');
    await user.click(
      await within(sheet).findByRole('checkbox', { name: 'сирене' }),
    );
    await user.click(within(sheet).getByRole('radio', { name: 'Временен' }));
    await user.type(
      within(sheet).getByRole('textbox', { name: 'Бележка' }),
      'хладилник',
    );
    await user.click(
      within(sheet).getByRole('button', { name: 'Добави 2 продукта' }),
    );

    expect(
      screen.queryByRole('dialog', { name: 'Добави в килера' }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(names('Временни')).toEqual(['кайма', 'сирене']));
    expect(requests).toEqual([
      {
        method: 'POST',
        body: {
          ingredientId: mince.id,
          kind: 'use_up',
          note: 'хладилник',
          frozen: false,
        },
      },
      {
        method: 'POST',
        body: {
          ingredientId: cheese.id,
          kind: 'use_up',
          note: 'хладилник',
          frozen: false,
        },
      },
    ]);
  });

  it('„Добави“: продукт, който вече е в килера, не се предлага', async () => {
    const user = userEvent.setup();
    servePantry([pantryItem(rice)]);

    renderApp('/pantry');
    await screen.findByText('ориз');
    await user.click(screen.getByRole('button', { name: 'Добави' }));
    const sheet = screen.getByRole('dialog', { name: 'Добави в килера' });
    await user.type(
      within(sheet).getByRole('searchbox', { name: 'Търси продукт' }),
      'о',
    );

    expect(
      await within(sheet).findByRole('checkbox', { name: 'олио' }),
    ).toBeInTheDocument();
    expect(
      within(sheet).queryByRole('checkbox', { name: 'ориз' }),
    ).not.toBeInTheDocument();
  });

  it('„Добави“: нов продукт се създава на място и влиза в избора', async () => {
    const user = userEvent.setup();
    const requests = servePantry();
    const mint = {
      id: 'cccccccc-0000-4000-8000-000000000009',
      name: 'джоджен',
      unit: 'g',
      aisle: 'produce',
    };
    server.use(
      http.post('/api/ingredients', () =>
        HttpResponse.json({ ingredient: mint }, { status: 201 }),
      ),
    );

    renderApp('/pantry');
    await user.click(await screen.findByRole('button', { name: 'Добави' }));
    const sheet = screen.getByRole('dialog', { name: 'Добави в килера' });
    await user.type(
      within(sheet).getByRole('searchbox', { name: 'Търси продукт' }),
      'Джоджен',
    );
    await user.click(
      await within(sheet).findByRole('button', { name: 'Нов продукт' }),
    );
    const form = within(sheet).getByRole('group', { name: 'Нов продукт' });
    await user.selectOptions(
      within(form).getByRole('combobox', { name: 'Щанд' }),
      'Плод и зеленчук',
    );
    await user.click(within(form).getByRole('button', { name: 'Създай' }));

    expect(
      await within(sheet).findByRole('checkbox', { name: 'джоджен' }),
    ).toBeChecked();
    await user.click(
      within(sheet).getByRole('button', { name: 'Добави 1 продукт' }),
    );
    expect(requests).toEqual([
      {
        method: 'POST',
        body: { ingredientId: mint.id, kind: 'staple', frozen: false },
      },
    ]);
  });

  describe('„Върни“ (#129 D-05)', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(fixtureNow);
    });

    it('„Използвано“ маха реда веднага, а DELETE тръгва чак когато toast-ът изтече', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const item = pantryItem(mince, { kind: 'use_up' });
      const requests = servePantry([item, pantryItem(rice)]);

      renderApp('/pantry');
      await user.click(
        await screen.findByRole('button', { name: 'Използвано: кайма' }),
      );

      expect(screen.queryByText('кайма')).not.toBeInTheDocument();
      expect(screen.getByText('Махна „кайма“ от килера')).toBeInTheDocument();
      await act(() => vi.advanceTimersByTimeAsync(7000));
      expect(requests).toEqual([]);

      await act(() => vi.advanceTimersByTimeAsync(1500));
      await vi.waitFor(() =>
        expect(requests).toEqual([{ method: 'DELETE', id: item.id }]),
      );
      expect(screen.queryByText('Махна „кайма“ от килера')).toBeNull();
      expect(screen.queryByText('кайма')).not.toBeInTheDocument();
      expect(names('Постоянни')).toEqual(['ориз']);
    });

    it('„Върни“ връща реда с бележката и възрастта, без заявка', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const requests = servePantry([
        pantryItem(mince, {
          kind: 'use_up',
          note: '500 г',
          createdAt: '2026-11-01T07:00:00.000Z',
        }),
      ]);

      renderApp('/pantry');
      await user.click(
        await screen.findByRole('button', { name: 'Използвано: кайма' }),
      );
      await user.click(screen.getByRole('button', { name: 'Върни' }));

      expect(names('Временни')).toEqual(['кайма']);
      expect(screen.getByText('500 г')).toBeInTheDocument();
      expect(screen.getByText('от 3 дни')).toBeInTheDocument();
      await act(() => vi.advanceTimersByTimeAsync(10_000));
      expect(requests).toEqual([]);
    });

    it('„махни“ на постоянен продукт: същият toast; ново действие праща изчакващото изтриване веднага', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const riceItem = pantryItem(rice);
      const saltItem = pantryItem(salt);
      const requests = servePantry([riceItem, saltItem]);

      renderApp('/pantry');
      await user.click(
        await screen.findByRole('button', { name: 'Махни: ориз' }),
      );
      expect(screen.getByText('Махна „ориз“ от килера')).toBeInTheDocument();
      expect(names('Постоянни')).toEqual(['сол']);

      await user.click(screen.getByRole('button', { name: 'Махни: сол' }));
      await vi.waitFor(() =>
        expect(requests).toEqual([{ method: 'DELETE', id: riceItem.id }]),
      );
      expect(screen.getByText('Махна „сол“ от килера')).toBeInTheDocument();
      expect(screen.queryByText('Махна „ориз“ от килера')).toBeNull();
    });

    it('напускане на екрана праща изчакващото изтриване веднага', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const item = pantryItem(mince, { kind: 'use_up' });
      const requests = servePantry([item]);

      renderApp('/pantry');
      await user.click(
        await screen.findByRole('button', { name: 'Използвано: кайма' }),
      );
      const nav = screen.getByRole('navigation', {
        name: 'Основна навигация',
      });
      await user.click(within(nav).getByRole('link', { name: 'Меню' }));

      await vi.waitFor(() =>
        expect(requests).toEqual([{ method: 'DELETE', id: item.id }]),
      );
    });

    it.each([
      [
        'презареждане или затваряне (pagehide)',
        () => window.dispatchEvent(new Event('pagehide')),
      ],
      [
        'скриване на приложението (visibilitychange)',
        () => {
          vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(
            'hidden',
          );
          document.dispatchEvent(new Event('visibilitychange'));
        },
      ],
    ])(
      '%s праща изчакващото изтриване веднага, без да чака toast-а (#209)',
      async (_name, leave) => {
        const user = userEvent.setup({
          advanceTimers: vi.advanceTimersByTime,
        });
        const item = pantryItem(mince, { kind: 'use_up' });
        const requests = servePantry([item]);

        renderApp('/pantry');
        await user.click(
          await screen.findByRole('button', { name: 'Използвано: кайма' }),
        );
        act(leave);

        await vi.waitFor(() =>
          expect(requests).toEqual([{ method: 'DELETE', id: item.id }]),
        );
        expect(screen.queryByRole('button', { name: 'Върни' })).toBeNull();
      },
    );

    it('при грешка редът се връща и казва защо', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      servePantry([pantryItem(mince, { kind: 'use_up' })]);
      server.use(
        http.delete('/api/pantry/:id', () =>
          HttpResponse.json(
            { error: 'internal_error', message: 'Сървърът не отговаря' },
            { status: 500 },
          ),
        ),
      );

      renderApp('/pantry');
      await user.click(
        await screen.findByRole('button', { name: 'Използвано: кайма' }),
      );
      await act(() => vi.advanceTimersByTimeAsync(8500));

      expect(
        await screen.findByText('Сървърът не отговаря'),
      ).toBeInTheDocument();
      expect(names('Временни')).toEqual(['кайма']);
    });
  });

  it('постоянен продукт става временен и обратно', async () => {
    const user = userEvent.setup();
    const item = pantryItem(oil);
    const requests = servePantry([item]);

    renderApp('/pantry');
    await user.click(
      await screen.findByRole('button', { name: 'Направи временен: олио' }),
    );

    expect(names('Временни')).toEqual(['олио']);
    expect(names('Постоянни')).toEqual([]);
    await user.click(
      await screen.findByRole('button', { name: 'Направи постоянен: олио' }),
    );
    expect(names('Постоянни')).toEqual(['олио']);
    await waitFor(() =>
      expect(requests).toEqual([
        { method: 'PATCH', id: item.id, body: { kind: 'use_up' } },
        { method: 'PATCH', id: item.id, body: { kind: 'staple' } },
      ]),
    );
  });

  it('„Добави“ с „Във фризера“: целият избор е замразен и има ❄️ до името', async () => {
    const user = userEvent.setup();
    const requests = servePantry();

    renderApp('/pantry');
    await user.click(await screen.findByRole('button', { name: 'Добави' }));
    const sheet = screen.getByRole('dialog', { name: 'Добави в килера' });
    await user.type(
      within(sheet).getByRole('searchbox', { name: 'Търси продукт' }),
      'кайма',
    );
    await user.click(
      await within(sheet).findByRole('checkbox', { name: 'кайма' }),
    );
    await user.click(within(sheet).getByRole('radio', { name: 'Временен' }));
    await user.click(
      within(sheet).getByRole('checkbox', { name: '❄️ Във фризера' }),
    );
    await user.click(
      within(sheet).getByRole('button', { name: 'Добави 1 продукт' }),
    );

    await waitFor(() => expect(names('Временни')).toEqual(['кайма']));
    const row = within(
      screen.getByRole('region', { name: 'Временни' }),
    ).getByRole('listitem');
    expect(
      within(row).getByRole('img', { name: 'Във фризера' }),
    ).toHaveTextContent('❄️');
    expect(requests).toEqual([
      {
        method: 'POST',
        body: { ingredientId: mince.id, kind: 'use_up', frozen: true },
      },
    ]);
  });

  it('❄️ стои до името на замразените продукти и в двете групи, а бележката остава', async () => {
    servePantry([
      pantryItem(rice),
      pantryItem(salt, { frozen: true }),
      pantryItem(mince, { kind: 'use_up', note: '~500 г', frozen: true }),
      pantryItem(cheese, { kind: 'use_up' }),
    ]);

    renderApp('/pantry');
    await screen.findByText('кайма');

    function frozenIn(group: string): string[] {
      return within(screen.getByRole('region', { name: group }))
        .getAllByRole('listitem')
        .filter((row) =>
          within(row).queryByRole('img', { name: 'Във фризера' }),
        )
        .map(
          (row) => row.querySelector('.pantry-item__name')?.textContent ?? '',
        );
    }
    expect(frozenIn('Постоянни')).toEqual(['сол']);
    expect(frozenIn('Временни')).toEqual(['кайма']);
    expect(names('Временни')).toEqual(['кайма', 'сирене']);
    expect(screen.getByText('~500 г')).toBeInTheDocument();
  });

  it.each([
    ['Временни', pantryItem(mince, { kind: 'use_up' }), 'кайма'],
    ['Постоянни', pantryItem(rice), 'ориз'],
  ] as const)(
    '„Във фризера“ е превключвател с надпис в група „%s“ и праща PATCH',
    async (group, item, name) => {
      const user = userEvent.setup();
      const requests = servePantry([item]);

      renderApp('/pantry');
      await screen.findByText(name);
      const toggle = within(
        screen.getByRole('region', { name: group }),
      ).getByRole('checkbox', { name: '❄️ Във фризера' });
      expect(toggle).not.toBeChecked();
      await user.click(toggle);

      expect(toggle).toBeChecked();
      expect(
        screen.getByRole('img', { name: 'Във фризера' }),
      ).toBeInTheDocument();
      await user.click(toggle);
      await waitFor(() => expect(toggle).not.toBeChecked());
      expect(
        screen.queryByRole('img', { name: 'Във фризера' }),
      ).not.toBeInTheDocument();
      await waitFor(() =>
        expect(requests).toEqual([
          { method: 'PATCH', id: item.id, body: { frozen: true } },
          { method: 'PATCH', id: item.id, body: { frozen: false } },
        ]),
      );
    },
  );

  it('постоянен продукт, добавен „Във фризера“, се изважда с превключвателя (#209)', async () => {
    const user = userEvent.setup();
    const item = pantryItem(salt, { frozen: true });
    const requests = servePantry([item]);

    renderApp('/pantry');
    const toggle = await within(
      await screen.findByRole('region', { name: 'Постоянни' }),
    ).findByRole('checkbox', { name: '❄️ Във фризера' });
    expect(toggle).toBeChecked();
    await user.click(toggle);

    await waitFor(() => expect(toggle).not.toBeChecked());
    await waitFor(() =>
      expect(requests).toEqual([
        { method: 'PATCH', id: item.id, body: { frozen: false } },
      ]),
    );
  });

  it('„Свърши“ на постоянен продукт праща ran-out и показва „свърши · в списъка“', async () => {
    const user = userEvent.setup();
    const item = pantryItem(rice);
    const requests = servePantry([item, pantryItem(salt)]);

    renderApp('/pantry');
    await screen.findByText('ориз');
    const [riceRow, saltRow] = within(
      screen.getByRole('region', { name: 'Постоянни' }),
    ).getAllByRole('listitem');
    expect(riceRow).not.toHaveTextContent('свърши · в списъка');
    await user.click(screen.getByRole('button', { name: 'Свърши: ориз' }));

    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'Постоянни' })).getAllByRole(
          'listitem',
        )[0],
      ).toHaveTextContent('свърши · в списъка'),
    );
    expect(requests).toEqual([{ method: 'POST', id: item.id }]);
    expect(saltRow).not.toHaveTextContent('свърши · в списъка');
    expect(screen.getByRole('button', { name: 'Свърши: ориз' })).toBeDisabled();
  });

  it('без връзка всяко „Свърши“ е изключено и описано с „Иска връзка“', async () => {
    servePantry([pantryItem(rice), pantryItem(salt)]);
    renderApp('/pantry');
    await screen.findByText('ориз');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    for (const name of ['Свърши: ориз', 'Свърши: сол']) {
      const ranOut = screen.getByRole('button', { name });
      expect(ranOut).toBeDisabled();
      expect(ranOut).toHaveAccessibleDescription('Иска връзка');
    }
  });

  it('„Добави в килера“: бележката подсказва количество, а горният бутон е „Затвори“ и не записва', async () => {
    const user = userEvent.setup();
    const requests = servePantry();

    renderApp('/pantry');
    await screen.findByText('Няма постоянни продукти.');
    await user.click(screen.getByRole('button', { name: 'Добави' }));
    const sheet = screen.getByRole('dialog', { name: 'Добави в килера' });
    expect(
      within(sheet).getByRole('textbox', { name: 'Бележка' }),
    ).toHaveAttribute('placeholder', 'напр. 500 г, отворено от понеделник');
    expect(
      within(sheet).queryByRole('button', { name: 'Готово' }),
    ).not.toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Затвори' }));

    expect(
      screen.queryByRole('dialog', { name: 'Добави в килера' }),
    ).not.toBeInTheDocument();
    expect(requests).toEqual([]);
  });

  it.each([
    { picks: ['кайма'], message: 'Добавен: кайма', submit: 'Добави 1 продукт' },
    {
      picks: ['кайма', 'сирене', 'олио'],
      message: 'Добавени: 3 продукта',
      submit: 'Добави 3 продукта',
    },
  ])(
    'след „Добави“ toast „$message“ и превъртане до първия добавен ред',
    async ({ picks, message, submit }) => {
      const user = userEvent.setup();
      const scrolled: string[] = [];
      vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(
        function (this: Element) {
          scrolled.push(
            this.querySelector('.pantry-item__name')?.textContent ?? '',
          );
        },
      );
      servePantry([pantryItem(rice)]);

      renderApp('/pantry');
      await screen.findByText('ориз');
      await user.click(screen.getByRole('button', { name: 'Добави' }));
      const sheet = screen.getByRole('dialog', { name: 'Добави в килера' });
      const search = within(sheet).getByRole('searchbox', {
        name: 'Търси продукт',
      });
      for (const name of picks) {
        await user.clear(search);
        await user.type(search, name);
        await user.click(await within(sheet).findByRole('checkbox', { name }));
      }
      await user.click(within(sheet).getByRole('button', { name: submit }));

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(scrolled[0]).toBe(picks[0]);
    },
  );
});
