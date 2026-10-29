import { act, cleanup, screen, within } from '@testing-library/react';
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
      act(() => {
        window.dispatchEvent(new Event('offline'));
      });
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
    // `onlineManager` на react-query е общ за всички тестове. Екранът се затваря първо, за да не презареди нищо,
    // което да пише в кеша след почистването му.
    cleanup();
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
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
      await screen.findByRole('button', { name: /1 отметка чака връзка$/ }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/остарели данни/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Домати' })).toBeChecked();
    // Отметнатият ред стои на мястото си, докато не мине забавянето.
    expect(rowTitles('Плод и зеленчук')).toEqual(['Домати', 'Лук', 'Чушки']);
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
    // Опашката се изпразва преди списъкът да е прочетен наново: „чака“ и „остарели данни“ изчезват поотделно.
    await vi.waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Всички отметки са изпратени' }),
      ).toBeInTheDocument();
      expect(screen.queryByText(/остарели данни/)).not.toBeInTheDocument();
    });
    expect(screen.getByRole('checkbox', { name: 'Домати' })).toBeChecked();
    expect(screen.getByText('4 от 6')).toBeInTheDocument();
  });

  it('иконата за синхронизация стои в реда с брояча: без връзка зачертан облак с броя, докосването обяснява', async () => {
    const user = userEvent.setup();
    serveShopping({ [thisWeek]: shoppingList() });
    const net = connection();

    renderApp('/shopping');
    const count = (await screen.findByText('5 от 6')).closest('p');
    if (!count) throw new Error('редът с брояча липсва');
    const sent = within(count).getByRole('button', {
      name: 'Всички отметки са изпратени',
    });
    expect(sent).toHaveTextContent('');

    net.offline();
    await user.click(screen.getByRole('checkbox', { name: 'Домати' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Лук' }));

    const icon = await within(count).findByRole('button', {
      name: 'Няма връзка · 2 отметки чакат връзка',
    });
    expect(icon).toHaveTextContent('2');
    expect(screen.queryByText(/отметки чакат връзка/)).not.toBeInTheDocument();

    await user.click(icon);
    expect(
      screen.getByText('2 отметки чакат връзка, ще се изпратят сами.'),
    ).toBeInTheDocument();
  });

  it('с връзка докосването на иконата праща чакащите отметки веднага', async () => {
    const user = userEvent.setup();
    const shopping = serveShopping({ [thisWeek]: shoppingList() });
    let refuse = true;
    server.use(
      http.put(
        `/api/shopping-lists/:weekStart/items/${tomatoes.key}/checked`,
        () => (refuse ? apiError(400, 'invalid_action', 'Не може') : undefined),
      ),
    );

    renderApp('/shopping');
    await screen.findByText('5 от 6');
    await user.click(screen.getByRole('checkbox', { name: 'Домати' }));
    const icon = await screen.findByRole(
      'button',
      { name: '1 отметка чака връзка' },
      { timeout: 3000 },
    );
    expect(icon).toHaveTextContent('1');
    expect(shopping.requests).toEqual([]);

    refuse = false;
    await user.click(icon);

    expect(
      screen.getByText('1 отметка чака връзка, ще се изпрати сама.'),
    ).toBeInTheDocument();
    await vi.waitFor(() =>
      expect(shopping.requests.map((r) => r.path)).toEqual([
        `${thisWeek}/items/${tomatoes.key}/checked`,
      ]),
    );
    expect(
      await screen.findByRole('button', {
        name: 'Всички отметки са изпратени',
      }),
    ).toBeInTheDocument();
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
    await screen.findByRole('button', { name: /2 отметки чакат връзка$/ });
    first.unmount();

    // Ново отваряне без връзка: последният списък от кеша, с отметките от опашката.
    const second = renderApp('/shopping');
    expect(await screen.findByText(/остарели данни/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Лук' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Мляко' })).toBeChecked();
    expect(
      await screen.findByRole('button', { name: /2 отметки чакат връзка$/ }),
    ).toBeInTheDocument();
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
    expect(
      screen.getByRole('button', { name: 'Всички отметки са изпратени' }),
    ).toBeInTheDocument();
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
    await screen.findByRole('button', { name: /2 отметки чакат връзка$/ });
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
    expect(await screen.findByText('3 от 5')).toBeInTheDocument();
    await vi.waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Всички отметки са изпратени' }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Домати' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Лук' })).toBeChecked();
  });

  it('404 (менюто на седмицата е изтрито) маха всички отметки за седмицата и показва списъка без меню', async () => {
    const user = userEvent.setup();
    const shopping = serveShopping({ [thisWeek]: shoppingList() });
    const net = connection();

    const first = renderApp('/shopping');
    await screen.findByText('5 от 6');
    net.offline();
    await user.click(screen.getByRole('checkbox', { name: 'Домати' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Лук' }));
    await screen.findByRole('button', { name: /2 отметки чакат връзка$/ });
    // Докато телефонът е без връзка, менюто на седмицата е изтрито.
    delete shopping.lists[thisWeek];

    net.online();

    expect(
      await screen.findByText(
        'Менюто ще добави продуктите си, когато е готово',
      ),
    ).toBeInTheDocument();
    expect(shopping.requests.map((r) => r.path)).toEqual([
      `${thisWeek}/items/${tomatoes.key}/checked`,
      `${thisWeek}/items/${onions.key}/checked`,
    ]);
    first.unmount();
    // Опашката е празна: с ново меню следващото четене не праща нищо и не чака нищо.
    shopping.lists[thisWeek] = shoppingList();
    renderApp('/shopping');
    expect(await screen.findByText('5 от 6')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Всички отметки са изпратени' }),
    ).toBeInTheDocument();
    expect(shopping.requests).toHaveLength(2);
  });

  it('отметката се изпраща от името на този, който я е направил, и след смяна на потребителя', async () => {
    const user = userEvent.setup();
    const shopping = serveShopping({ [thisWeek]: shoppingList() });
    const net = connection();

    renderApp('/shopping');
    await screen.findByText('5 от 6');
    net.offline();
    await user.click(screen.getByRole('checkbox', { name: 'Домати' }));
    await screen.findByRole('button', { name: /1 отметка чака връзка$/ });
    // Поли взима телефона, без да е имало връзка.
    localStorage.setItem(ACTING_USER_KEY, poli.id);
    await user.click(screen.getByRole('checkbox', { name: 'Лук' }));
    await screen.findByRole('button', { name: /2 отметки чакат връзка$/ });

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
    await screen.findByRole('button', { name: /2 отметки чакат връзка$/ });

    net.online();

    await vi.waitFor(() =>
      expect(shopping.requests.map((r) => r.path)).toEqual([
        `${thisWeek}/items/${onions.key}/checked`,
      ]),
    );
    expect(
      await screen.findByRole('button', { name: /1 отметка чака връзка$/ }),
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
      expect(
        screen.getByRole('button', { name: 'Всички отметки са изпратени' }),
      ).toBeInTheDocument(),
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
    await screen.findByRole('button', { name: /1 отметка чака връзка$/ });
    first.unmount();
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('Диск', 'UnknownError');
    });

    net.online();
    renderApp('/shopping');

    expect(await screen.findByText('Плод и зеленчук')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('без връзка „Скрий“, „Изтрий“ и „+ Добави“ са изключени с „Иска връзка“ още преди докосването', async () => {
    const user = userEvent.setup();
    const shopping = serveShopping({ [thisWeek]: shoppingList() });
    const net = connection();

    renderApp('/shopping');
    await screen.findByText('5 от 6');
    net.offline();

    const add = screen.getByRole('button', { name: '+ Добави' });
    expect(add).toBeDisabled();
    expect(add).toHaveAccessibleDescription('Иска връзка');

    await user.click(screen.getByRole('button', { name: 'Още за Лук' }));
    const sheet = screen.getByRole('dialog', { name: 'Лук' });
    const hide = within(sheet).getByRole('button', {
      name: 'Скрий от списъка',
    });
    expect(hide).toBeDisabled();
    expect(hide).toHaveAccessibleDescription('Иска връзка');
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    await user.click(screen.getByRole('button', { name: 'Още за Кафе' }));
    const manual = screen.getByRole('dialog', { name: 'Кафе' });
    const remove = within(manual).getByRole('button', { name: 'Изтрий' });
    expect(remove).toBeDisabled();
    expect(remove).toHaveAccessibleDescription('Иска връзка');

    expect(shopping.requests).toEqual([]);
  });

  it('листът „Добави“, отворен преди връзката да падне, казва „Иска връзка“ веднъж и не праща нищо', async () => {
    const user = userEvent.setup();
    const shopping = serveShopping({ [thisWeek]: shoppingList() });
    const net = connection();

    renderApp('/shopping');
    await screen.findByText('5 от 6');
    await user.click(screen.getByRole('button', { name: '+ Добави' }));
    const sheet = screen.getByRole('dialog', { name: 'Добави' });
    await user.type(within(sheet).getByLabelText('Заглавие'), 'кърпи');
    net.offline();

    const submit = within(sheet).getByRole('button', { name: 'Добави' });
    expect(submit).toBeDisabled();
    expect(within(sheet).getAllByText('Иска връзка')).toHaveLength(1);
    expect(screen.queryByText('Няма връзка')).not.toBeInTheDocument();
    expect(shopping.requests).toEqual([]);
  });

  it('след online `GET /api/users` се вика отново и аватарите на отметналите се виждат', async () => {
    const user = userEvent.setup();
    serveShopping({ [thisWeek]: shoppingList() });
    let usersDown = true;
    let usersRequests = 0;
    server.use(
      http.get('/api/users', () => {
        usersRequests += 1;
        return usersDown ? HttpResponse.error() : undefined;
      }),
    );
    const net = connection();

    // Хората не са стигнали до телефона (сървърът не ги е дал), а после връзката пада.
    const first = renderApp('/shopping');
    await screen.findByText('5 от 6');
    net.offline();
    await user.click(screen.getByRole('checkbox', { name: 'Домати' }));
    await screen.findByRole('button', { name: /1 отметка чака връзка$/ });
    first.unmount();

    // Презареждане без връзка: списъкът е от кеша, но кой е отметнал не се знае.
    renderApp('/shopping');
    await screen.findByText(/остарели данни/);
    expect(screen.getByRole('checkbox', { name: 'Домати' })).toBeChecked();
    expect(screen.queryByTitle(/Отметнато от/)).not.toBeInTheDocument();
    const before = usersRequests;

    usersDown = false;
    net.online();

    await vi.waitFor(() => expect(usersRequests).toBeGreaterThan(before));
    await vi.waitFor(() =>
      expect(screen.getAllByTitle('Отметнато от Дани')).toHaveLength(2),
    );
  });

  it('хората се пазят в кеша със списъка: след презареждане без връзка аватарите се виждат', async () => {
    const user = userEvent.setup();
    serveShopping({ [thisWeek]: shoppingList() });
    let usersDown = false;
    server.use(
      http.get('/api/users', () =>
        usersDown ? HttpResponse.error() : undefined,
      ),
    );
    const net = connection();

    const first = renderApp('/shopping');
    await screen.findByText('5 от 6');
    await screen.findByTitle('Отметнато от Дани');
    first.unmount();

    usersDown = true;
    net.offline();
    renderApp('/shopping');
    await user.click(await screen.findByRole('checkbox', { name: 'Домати' }));
    await screen.findByRole('button', { name: /1 отметка чака връзка$/ });
    expect(await screen.findAllByTitle('Отметнато от Дани')).toHaveLength(2);
  });
});
