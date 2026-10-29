import {
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sheet } from './Sheet';
import { SHEET_WINDOW_QUERY } from './sheet-drag';

/** Екранът държи отворения лист в state и го маха в `onClose`, както MenuWeek. */
function Screen({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <main>
      <h1>Меню</h1>
      <button type="button" onClick={() => setOpen(true)}>
        Отвори
      </button>
      {open && (
        <Sheet
          title="Ястие"
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        >
          <p>Боб чорба</p>
          <ul aria-label="Списък">
            <li>Леща</li>
          </ul>
        </Sheet>
      )}
    </main>
  );
}

/** Лист с бутон, който отваря втори лист над него (както „Нови продукти“ над рецептата). */
function StackedScreen() {
  const [lower, setLower] = useState(true);
  const [upper, setUpper] = useState(false);
  return (
    <main>
      {lower && (
        <Sheet title="Долен" onClose={() => setLower(false)}>
          <button type="button" onClick={() => setUpper(true)}>
            Още
          </button>
          {upper && (
            <Sheet title="Горен" onClose={() => setUpper(false)}>
              <p>Над долния</p>
            </Sheet>
          )}
        </Sheet>
      )}
    </main>
  );
}

/** Router върху истинската история на прозореца: Дашборд, Меню с лист и линк към рецепта. */
function renderRouted() {
  const root = createRootRoute({ component: Outlet });
  const routes = [
    createRoute({
      getParentRoute: () => root,
      path: '/',
      component: () => <h1>Дашборд</h1>,
    }),
    createRoute({
      getParentRoute: () => root,
      path: '/menu',
      component: function Menu() {
        const [open, setOpen] = useState(false);
        return (
          <main>
            <h1>Меню</h1>
            <button type="button" onClick={() => setOpen(true)}>
              Отвори
            </button>
            {open && (
              <Sheet title="Ястие" onClose={() => setOpen(false)}>
                <Link to="/recipes/$id" params={{ id: '7' }}>
                  Към рецептата
                </Link>
              </Sheet>
            )}
          </main>
        );
      },
    }),
    createRoute({
      getParentRoute: () => root,
      path: '/recipes/$id',
      component: () => <h1>Рецепта</h1>,
    }),
  ];
  const history = createBrowserHistory();
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history,
  });
  render(<RouterProvider router={router} />);
  return history;
}

/** Предишният екран (Дашборд) и над него Меню, както при навигация в приложението. */
function enterMenu() {
  window.history.replaceState(null, '', '/');
  window.history.pushState(null, '', '/menu');
}

/** Една стъпка в историята; връща се при нейния `popstate`, а целта (екран, лист) се чака отделно. */
async function traverse(delta: -1 | 1) {
  const popped = new Promise((resolve) =>
    window.addEventListener('popstate', resolve, { once: true }),
  );
  window.history.go(delta);
  await popped;
}

const back = () => traverse(-1);
const forward = () => traverse(1);

async function expectPath(pathname: string) {
  await waitFor(() => expect(window.location.pathname).toBe(pathname));
}

/** Унищожава router-а на теста, ако има такъв: връща `history.pushState` и маха слушателите му. */
let destroy = () => {};

describe('Sheet и „назад“', () => {
  beforeEach(() => {
    enterMenu();
  });

  afterEach(async () => {
    destroy();
    destroy = () => {};
    cleanup();
    // Всеки тест свършва без отворен лист: тогава никой лист не е оставил своя `pushState` (нито router-ът своя),
    // и следващият тест започва от същата история.
    await waitFor(() =>
      expect(window.history.pushState).toBe(History.prototype.pushState),
    );
  });

  it('„назад“ при отворен лист го затваря, а екранът остава', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Screen onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Отвори' }));
    expect(screen.getByRole('dialog', { name: 'Ястие' })).toBeInTheDocument();

    await back();

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    await expectPath('/menu');
  });

  it('„Готово“ маха записа: следващото „назад“ напуска екрана', async () => {
    const user = userEvent.setup();
    render(<Screen />);
    await user.click(screen.getByRole('button', { name: 'Отвори' }));
    await user.click(screen.getByRole('button', { name: 'Готово' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(window.history.state).toBeNull());

    await back();

    await expectPath('/');
  });

  it('лист над лист: всяко „назад“ затваря по един, после напуска екрана', async () => {
    const user = userEvent.setup();
    render(<StackedScreen />);
    await user.click(screen.getByRole('button', { name: 'Още' }));
    expect(screen.getByRole('dialog', { name: 'Горен' })).toBeInTheDocument();

    await back();
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Горен' }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('dialog', { name: 'Долен' })).toBeInTheDocument();
    await expectPath('/menu');

    await back();
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    await expectPath('/menu');

    await back();
    await expectPath('/');
  });

  describe('с router-а', () => {
    it('затварянето с „назад“ оставя Меню, а следващото „назад“ води на Дашборда', async () => {
      const user = userEvent.setup();
      destroy = renderRouted().destroy;
      await user.click(await screen.findByRole('button', { name: 'Отвори' }));

      await back();
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
      expect(screen.getByRole('heading', { name: 'Меню' })).toBeInTheDocument();

      await back();
      expect(
        await screen.findByRole('heading', { name: 'Дашборд' }),
      ).toBeInTheDocument();
    });

    it('линк от листа: едно „назад“ от рецептата връща на Меню без лист, второ — на Дашборда', async () => {
      const user = userEvent.setup();
      destroy = renderRouted().destroy;
      await user.click(await screen.findByRole('button', { name: 'Отвори' }));
      await user.click(screen.getByRole('link', { name: 'Към рецептата' }));
      expect(
        await screen.findByRole('heading', { name: 'Рецепта' }),
      ).toBeInTheDocument();

      await back();
      expect(
        await screen.findByRole('heading', { name: 'Меню' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      await back();
      expect(
        await screen.findByRole('heading', { name: 'Дашборд' }),
      ).toBeInTheDocument();
    });

    it('линк от листа: „напред“ след „назад“ отива на рецептата и остава там', async () => {
      const user = userEvent.setup();
      destroy = renderRouted().destroy;
      await user.click(await screen.findByRole('button', { name: 'Отвори' }));
      await user.click(screen.getByRole('link', { name: 'Към рецептата' }));
      await screen.findByRole('heading', { name: 'Рецепта' });
      await back();
      await screen.findByRole('heading', { name: 'Меню' });

      await forward();

      expect(
        await screen.findByRole('heading', { name: 'Рецепта' }),
      ).toBeInTheDocument();
      await expectPath('/recipes/7');
    });
  });
});

/** Плъзгане с пръст по листа: от `fromY` до `toY` за `ms` милисекунди. */
function drag(target: Element, fromY: number, toY: number, ms = 400) {
  const now = vi.spyOn(performance, 'now');
  now.mockReturnValue(1000);
  fireEvent.touchStart(target, { touches: [{ clientX: 100, clientY: fromY }] });
  now.mockReturnValue(1000 + ms / 2);
  fireEvent.touchMove(target, {
    touches: [{ clientX: 100, clientY: (fromY + toY) / 2 }],
  });
  now.mockReturnValue(1000 + ms);
  fireEvent.touchMove(target, { touches: [{ clientX: 100, clientY: toY }] });
  fireEvent.touchEnd(target, {
    touches: [],
    changedTouches: [{ clientX: 100, clientY: toY }],
  });
  now.mockRestore();
}

/** Листът на телефона е висок 400 px; `scrollTop` е колко е превъртяно съдържанието му. */
async function openTallSheet(onClose: () => void, scrollTop = 0) {
  const user = userEvent.setup();
  render(<Screen onClose={onClose} />);
  await user.click(screen.getByRole('button', { name: 'Отвори' }));
  const panel = screen.getByRole('dialog', { name: 'Ястие' });
  Object.defineProperty(panel, 'clientHeight', { value: 400 });
  Object.defineProperty(panel, 'offsetHeight', { value: 400 });
  panel.scrollTop = scrollTop;
  return panel;
}

describe('Sheet: затваряне', () => {
  beforeEach(() => {
    enterMenu();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    cleanup();
    await waitFor(() =>
      expect(window.history.pushState).toBe(History.prototype.pushState),
    );
  });

  it('„Готово“ е в заглавието на листа и го затваря', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Screen onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Отвори' }));
    const header = within(
      screen.getByRole('dialog', { name: 'Ястие' }),
    ).getByRole('banner');

    await user.click(within(header).getByRole('button', { name: 'Готово' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('плъзгане надолу с над четвърт от височината затваря листа', async () => {
    const onClose = vi.fn();
    const panel = await openTallSheet(onClose);

    drag(screen.getByText('Боб чорба'), 100, 220);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(panel).not.toBeInTheDocument();
  });

  it('късо бавно плъзгане връща листа на мястото му', async () => {
    const onClose = vi.fn();
    const panel = await openTallSheet(onClose);

    drag(screen.getByText('Боб чорба'), 100, 160);

    expect(onClose).not.toHaveBeenCalled();
    expect(panel.style.transform).toBe('');
  });

  it('бързото късо плъзгане надолу затваря листа', async () => {
    const onClose = vi.fn();
    await openTallSheet(onClose);

    drag(screen.getByText('Боб чорба'), 100, 160, 80);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('превъртяно съдържание: плъзгането надолу превърта, не затваря', async () => {
    const onClose = vi.fn();
    await openTallSheet(onClose, 120);

    drag(screen.getByText('Боб чорба'), 100, 300);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('превъртян вложен списък (напр. изборът на рецепта): плъзгането надолу го превърта, не затваря листа', async () => {
    const onClose = vi.fn();
    await openTallSheet(onClose);
    screen.getByRole('list', { name: 'Списък' }).scrollTop = 80;

    drag(screen.getByText('Леща'), 100, 300);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('на таблета (прозорец) плъзгането не затваря листа', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === SHEET_WINDOW_QUERY,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const onClose = vi.fn();
    await openTallSheet(onClose);

    drag(screen.getByText('Боб чорба'), 100, 300);

    expect(onClose).not.toHaveBeenCalled();
  });
});
