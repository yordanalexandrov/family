import { screen, waitFor, within } from '@testing-library/react';
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

  it('„Използвано“ маха временния продукт веднага и праща DELETE', async () => {
    const user = userEvent.setup();
    const item = pantryItem(mince, { kind: 'use_up' });
    const requests = servePantry([item, pantryItem(rice)]);

    renderApp('/pantry');
    await user.click(
      await screen.findByRole('button', { name: 'Използвано: кайма' }),
    );

    expect(screen.queryByText('кайма')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(requests).toEqual([{ method: 'DELETE', id: item.id }]),
    );
    expect(names('Постоянни')).toEqual(['ориз']);
  });

  it('при грешка „Използвано“ връща продукта и казва защо', async () => {
    const user = userEvent.setup();
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

    expect(await screen.findByText('Сървърът не отговаря')).toBeInTheDocument();
    expect(names('Временни')).toEqual(['кайма']);
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

  it('„Във фризера“ се превключва за всеки продукт и праща PATCH', async () => {
    const user = userEvent.setup();
    const item = pantryItem(mince, { kind: 'use_up' });
    const requests = servePantry([item]);

    renderApp('/pantry');
    const toggle = await screen.findByRole('button', {
      name: 'Във фризера: кайма',
    });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('img', { name: 'Във фризера' }),
    ).toBeInTheDocument();
    await user.click(toggle);
    await waitFor(() =>
      expect(toggle).toHaveAttribute('aria-pressed', 'false'),
    );
    expect(
      screen.queryByRole('img', { name: 'Във фризера' }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(requests).toEqual([
        { method: 'PATCH', id: item.id, body: { frozen: true } },
        { method: 'PATCH', id: item.id, body: { frozen: false } },
      ]),
    );
  });
});
