import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTING_USER_KEY } from '../../app/acting-user';
import { thisWeek } from '../../test/menu';
import { apiError, dani, fixtureNow, poli, server } from '../../test/msw';
import { renderApp, setUpDevice } from '../../test/render';
import {
  milk,
  onions,
  serveShopping,
  shoppingList,
  tomatoes,
} from '../../test/shopping';

/**
 * Симулиран офлайн: `navigator.onLine` е `false`, а всяка заявка към списъка пада с мрежова грешка (msw). При
 * `online()` заявките отново стигат до `serveShopping` и се праща събитието `online`.
 */
function connection() {
  let offline = false;
  const onLine = vi.spyOn(navigator, 'onLine', 'get');
  server.use(
    http.all('/api/shopping-lists/*', () =>
      offline ? HttpResponse.error() : undefined,
    ),
  );
  return {
    offline() {
      offline = true;
      onLine.mockReturnValue(false);
    },
    online() {
      offline = false;
      onLine.mockReturnValue(true);
      act(() => {
        window.dispatchEvent(new Event('online'));
      });
    },
  };
}

function rowTitles(aisle: string): string[] {
  const section = screen.getByRole('region', { name: aisle });
  return within(section)
    .getAllByRole('checkbox')
    .map((box) => box.getAttribute('aria-label') ?? '');
}

describe('ShoppingWeek офлайн', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(fixtureNow);
    setUpDevice('phone', dani.id);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('без връзка отметката остава локално и чака в опашката; при online се изпраща и опашката се чисти', async () => {
    const user = userEvent.setup();
    const shopping = serveShopping({ [thisWeek]: shoppingList() });
    const net = connection();

    renderApp('/shopping');
    await screen.findByText('5 от 6');
    net.offline();
    await user.click(screen.getByRole('checkbox', { name: 'Домати' }));

    expect(
      await screen.findByText('1 отметка чака връзка'),
    ).toBeInTheDocument();
    expect(await screen.findByText(/остарели данни/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Домати' })).toBeChecked();
    expect(rowTitles('Плод и зеленчук')).toEqual(['Лук', 'Домати', 'Чушки']);
    expect(screen.getByText('4 от 6')).toBeInTheDocument();
    expect(shopping.requests).toEqual([]);

    net.online();

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
    await vi.waitFor(() =>
      expect(screen.queryByText(/чака връзка/)).not.toBeInTheDocument(),
    );
    expect(screen.queryByText(/остарели данни/)).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Домати' })).toBeChecked();
    expect(screen.getByText('4 от 6')).toBeInTheDocument();
  });

  it('опашката оцелява презареждане без връзка и тръгва по реда си при отваряне на екрана', async () => {
    const user = userEvent.setup();
    const shopping = serveShopping({ [thisWeek]: shoppingList() });
    const net = connection();

    const first = renderApp('/shopping');
    await screen.findByText('5 от 6');
    net.offline();
    await user.click(screen.getByRole('checkbox', { name: 'Лук' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Мляко' }));
    await screen.findByText('2 отметки чакат връзка');
    first.unmount();

    // Ново отваряне без връзка: последният списък от кеша, с отметките от опашката.
    const second = renderApp('/shopping');
    expect(await screen.findByText(/остарели данни/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Лук' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Мляко' })).toBeChecked();
    expect(screen.getByText('2 отметки чакат връзка')).toBeInTheDocument();
    second.unmount();

    net.online();
    renderApp('/shopping');

    await vi.waitFor(() =>
      expect(shopping.requests.map((r) => r.path)).toEqual([
        `${thisWeek}/items/${onions.key}/checked`,
        `${thisWeek}/items/${milk.key}/checked`,
      ]),
    );
    expect(await screen.findByText('3 от 6')).toBeInTheDocument();
    expect(screen.queryByText(/чака/)).not.toBeInTheDocument();
  });

  it('404 за ключ (редът вече не е в менюто) се маха от опашката тихо, следващите се изпращат', async () => {
    const user = userEvent.setup();
    const shopping = serveShopping({ [thisWeek]: shoppingList() });
    const net = connection();

    renderApp('/shopping');
    await screen.findByText('5 от 6');
    net.offline();
    await user.click(screen.getByRole('checkbox', { name: 'Домати' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Лук' }));
    await screen.findByText('2 отметки чакат връзка');
    // Докато телефонът е без връзка, доматите са махнати от менюто.
    const list = shoppingList();
    shopping.lists[thisWeek] = {
      ...list,
      aisles: list.aisles.map(({ aisle, items }) => ({
        aisle,
        items: items.filter((item) => item.key !== tomatoes.key),
      })),
      total: 5,
      remaining: 4,
    };

    net.online();

    await vi.waitFor(() =>
      expect(shopping.requests.map((r) => r.path)).toEqual([
        `${thisWeek}/items/${tomatoes.key}/checked`,
        `${thisWeek}/items/${onions.key}/checked`,
      ]),
    );
    await vi.waitFor(() =>
      expect(screen.queryByText(/чака/)).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Домати' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Лук' })).toBeChecked();
    expect(screen.getByText('3 от 5')).toBeInTheDocument();
  });

  it('отметката се изпраща от името на този, който я е направил, и след смяна на потребителя', async () => {
    const user = userEvent.setup();
    const shopping = serveShopping({ [thisWeek]: shoppingList() });
    const net = connection();

    renderApp('/shopping');
    await screen.findByText('5 от 6');
    net.offline();
    await user.click(screen.getByRole('checkbox', { name: 'Домати' }));
    await screen.findByText('1 отметка чака връзка');
    // Поли взима телефона, без да е имало връзка.
    localStorage.setItem(ACTING_USER_KEY, poli.id);
    await user.click(screen.getByRole('checkbox', { name: 'Лук' }));
    await screen.findByText('2 отметки чакат връзка');

    net.online();

    await vi.waitFor(() =>
      expect(
        shopping.requests.map(({ path, actingUser }) => ({ path, actingUser })),
      ).toEqual([
        {
          path: `${thisWeek}/items/${tomatoes.key}/checked`,
          actingUser: dani.id,
        },
        {
          path: `${thisWeek}/items/${onions.key}/checked`,
          actingUser: poli.id,
        },
      ]),
    );
  });

  it('друг 4xx освен 404 оставя отметката в опашката за следващия път, без да спира останалите', async () => {
    const user = userEvent.setup();
    const shopping = serveShopping({ [thisWeek]: shoppingList() });
    let refuse = true;
    server.use(
      http.put(
        `/api/shopping-lists/:weekStart/items/${tomatoes.key}/checked`,
        () => (refuse ? apiError(400, 'invalid_action', 'Не може') : undefined),
      ),
    );
    const net = connection();

    renderApp('/shopping');
    await screen.findByText('5 от 6');
    net.offline();
    await user.click(screen.getByRole('checkbox', { name: 'Домати' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Лук' }));
    await screen.findByText('2 отметки чакат връзка');

    net.online();

    await vi.waitFor(() =>
      expect(shopping.requests.map((r) => r.path)).toEqual([
        `${thisWeek}/items/${onions.key}/checked`,
      ]),
    );
    expect(
      await screen.findByText('1 отметка чака връзка'),
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Домати' })).toBeChecked();

    refuse = false;
    net.online();

    await vi.waitFor(() =>
      expect(shopping.requests.map((r) => r.path)).toEqual([
        `${thisWeek}/items/${onions.key}/checked`,
        `${thisWeek}/items/${tomatoes.key}/checked`,
      ]),
    );
    await vi.waitFor(() =>
      expect(screen.queryByText(/чака/)).not.toBeInTheDocument(),
    );
  });

  it('повреден IndexedDB при изпращането на опашката не пречи списъкът да се покаже', async () => {
    const user = userEvent.setup();
    serveShopping({ [thisWeek]: shoppingList() });
    const net = connection();

    const first = renderApp('/shopping');
    await screen.findByText('5 от 6');
    net.offline();
    await user.click(screen.getByRole('checkbox', { name: 'Домати' }));
    await screen.findByText('1 отметка чака връзка');
    first.unmount();
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('Диск', 'UnknownError');
    });

    net.online();
    renderApp('/shopping');

    expect(await screen.findByText('Плод и зеленчук')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('добавяне, скриване и изтриване без връзка казват „Няма връзка“ и не пращат нищо', async () => {
    const user = userEvent.setup();
    const shopping = serveShopping({ [thisWeek]: shoppingList() });
    const net = connection();

    renderApp('/shopping');
    await screen.findByText('5 от 6');
    net.offline();

    await user.click(screen.getByRole('button', { name: 'Скрий Лук' }));
    expect(await screen.findByText('Няма връзка')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Изтрий Кафе' }));
    await user.click(
      within(
        screen.getByRole('alertdialog', { name: 'Изтриване на Кафе' }),
      ).getByRole('button', { name: 'Изтрий' }),
    );

    await user.click(screen.getByRole('button', { name: '+ Добави' }));
    const sheet = screen.getByRole('dialog', { name: 'Добави' });
    await user.type(within(sheet).getByLabelText('Заглавие'), 'кафе');
    await user.click(within(sheet).getByRole('button', { name: 'Добави' }));
    expect(await within(sheet).findByRole('alert')).toHaveTextContent(
      'Няма връзка',
    );

    expect(shopping.requests).toEqual([]);
    expect(screen.getByRole('checkbox', { name: 'Лук' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Кафе' })).toBeInTheDocument();
  });
});
