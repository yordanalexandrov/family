import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inboxItem, serveInbox } from '../../test/inbox';
import { servePlans } from '../../test/menu';
import { dani, poli } from '../../test/msw';
import { servePantry } from '../../test/pantry';
import { renderApp, setUpDevice } from '../../test/render';
import { serveShopping } from '../../test/shopping';

/** Четвъртък, 5 ноември 2026, 09:00 в София. */
const NOW = new Date('2026-11-05T07:00:00Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

const cook = inboxItem({
  kind: 'cook',
  title: 'Кой готви довечера?',
  body: 'Мусака',
  url: '/menu?week=2026-11-02&meal=aaaaaaaa-0000-4000-8000-000000000001',
  // 08:15 в София днес.
  updatedAt: '2026-11-05T06:15:00.000Z',
});
const thaw = inboxItem({
  updatedAt: '2026-11-04T18:00:00.000Z',
  unread: false,
});
const menu = inboxItem({
  kind: 'menu',
  title: 'Поли по менюто',
  body: '2 гласа, 1 коментар',
  url: '/menu?week=2026-11-02',
  createdAt: '2026-11-02T17:30:00.000Z',
  updatedAt: '2026-11-02T17:30:00.000Z',
});

function group(name: string) {
  return screen.findByRole('region', { name });
}

describe('Входящата кутия', () => {
  it('подрежда известията в „Днес“, „Вчера“ и „По-рано“, с часа, заглавието и текста', async () => {
    serveInbox([cook, thaw, menu]);
    setUpDevice('phone', dani.id);
    renderApp('/inbox');

    expect(
      await screen.findByRole('heading', { name: 'Входяща кутия', level: 1 }),
    ).toBeInTheDocument();
    const today = await group('Днес');
    expect(within(today).getByRole('link')).toHaveAccessibleName(
      /Кой готви довечера\?/,
    );
    expect(today).toHaveTextContent('08:15');
    expect(today).toHaveTextContent('Мусака');
    expect(await group('Вчера')).toHaveTextContent('Извади месото за утре');
    expect(await group('Вчера')).toHaveTextContent('20:00');
    const earlier = await group('По-рано');
    expect(earlier).toHaveTextContent('Поли по менюто');
    expect(earlier).toHaveTextContent('2.11');
    expect(earlier).toHaveTextContent('19:30');
  });

  it('казва кое е непрочетено', async () => {
    serveInbox([cook, thaw]);
    setUpDevice('phone', dani.id);
    renderApp('/inbox');

    const unread = await screen.findByRole('link', {
      name: /Кой готви довечера\?/,
    });
    expect(unread).toHaveAccessibleName(/непрочетено/);
    expect(unread.closest('[data-unread]')).toHaveAttribute(
      'data-unread',
      'true',
    );
    const read = screen.getByRole('link', { name: /Извади месото за утре/ });
    expect(read).not.toHaveAccessibleName(/непрочетено/);
  });

  it('натискането на известие го прочита и води към линка му', async () => {
    const user = userEvent.setup();
    const inbox = serveInbox([menu]);
    servePlans();
    setUpDevice('phone', dani.id);
    const { router } = renderApp('/inbox');

    await user.click(
      await screen.findByRole('link', { name: /Поли по менюто/ }),
    );

    await waitFor(() => expect(inbox.reads).toEqual([menu.id]));
    await waitFor(() =>
      expect(router.state.location.href).toBe('/menu?week=2026-11-02'),
    );
  });

  it('натискането на прочетено известие само води към линка', async () => {
    const user = userEvent.setup();
    const inbox = serveInbox([thaw]);
    servePlans();
    setUpDevice('phone', dani.id);
    const { router } = renderApp('/inbox');

    await user.click(
      await screen.findByRole('link', { name: /Извади месото за утре/ }),
    );

    await waitFor(() => expect(router.state.location.pathname).toBe('/menu'));
    expect(inbox.reads).toEqual([]);
  });

  it('„Всички прочетени“ прочита всички', async () => {
    const user = userEvent.setup();
    const inbox = serveInbox([cook, menu]);
    setUpDevice('phone', dani.id);
    renderApp('/inbox');

    await user.click(
      await screen.findByRole('button', { name: 'Всички прочетени' }),
    );

    await waitFor(() => expect(inbox.readAll).toBe(1));
    await waitFor(() =>
      expect(
        screen.queryAllByRole('link', { name: /непрочетено/ }),
      ).toHaveLength(0),
    );
    expect(
      screen.getByRole('button', { name: 'Всички прочетени' }),
    ).toBeDisabled();
  });

  it('празната кутия казва „Няма известия“', async () => {
    serveInbox([]);
    setUpDevice('phone', dani.id);
    renderApp('/inbox');

    expect(await screen.findByText('Няма известия')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Всички прочетени' }),
    ).toBeDisabled();
  });

  it('е на действащия потребител', async () => {
    serveInbox([cook], dani.id);
    setUpDevice('browser', poli.id);
    renderApp('/inbox');

    expect(await screen.findByText('Няма известия')).toBeVisible();
  });
});

describe('камбанката', () => {
  it.each(['/', '/calendar', '/recipes', '/menu', '/shopping', '/pantry'])(
    'на %s е преди аватара, с броя на непрочетените, и води към кутията',
    async (path) => {
      serveInbox([cook, thaw, menu]);
      setUpDevice('phone', dani.id);
      servePlans();
      serveShopping();
      servePantry();
      renderApp(path);

      const bell = await screen.findByRole('link', {
        name: 'Входяща кутия · 2 непрочетени',
      });
      expect(bell).toHaveAttribute('href', '/inbox');
      expect(bell).toHaveTextContent('2');
      const avatar = screen.getByRole('link', { name: 'Ти си Дани · смени' });
      expect(
        bell.compareDocumentPosition(avatar) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    },
  );

  it('без непрочетени е без бройка', async () => {
    serveInbox([thaw]);
    setUpDevice('browser', dani.id);
    renderApp('/calendar');

    const bell = await screen.findByRole('link', { name: 'Входяща кутия' });
    expect(bell).not.toHaveTextContent(/\d/);
  });

  it('брои непрочетените на действащия потребител', async () => {
    serveInbox([cook, menu], dani.id);
    setUpDevice('phone', poli.id);
    renderApp('/calendar');

    expect(
      await screen.findByRole('link', { name: 'Входяща кутия' }),
    ).toBeInTheDocument();
  });

  it('намалява, когато известие стане прочетено', async () => {
    const user = userEvent.setup();
    serveInbox([cook, menu]);
    setUpDevice('browser', dani.id);
    renderApp('/inbox');

    await screen.findByRole('link', {
      name: 'Входяща кутия · 2 непрочетени',
    });
    await user.click(
      await screen.findByRole('button', { name: 'Всички прочетени' }),
    );

    expect(
      await screen.findByRole('link', { name: 'Входяща кутия' }),
    ).toBeInTheDocument();
  });

  it.each(['kiosk', 'tv'] as const)('я няма на %s', async (mode) => {
    serveInbox([cook]);
    setUpDevice(mode);
    renderApp('/calendar');

    expect(
      await screen.findByRole('heading', { name: 'Календар' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Входяща кутия/ })).toBeNull();
  });

  it('я няма и на дашборда на kiosk', async () => {
    serveInbox([cook]);
    setUpDevice('kiosk');
    renderApp('/');

    expect(
      await screen.findByRole('list', { name: 'Синхронизация' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Входяща кутия/ })).toBeNull();
  });
});
