import {
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sheet } from './Sheet';

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

async function forward() {
  const popped = new Promise((resolve) =>
    window.addEventListener('popstate', resolve, { once: true }),
  );
  window.history.forward();
  await popped;
}

async function back() {
  const popped = new Promise((resolve) =>
    window.addEventListener('popstate', resolve, { once: true }),
  );
  window.history.back();
  await popped;
}

describe('Sheet и „назад“', () => {
  beforeEach(() => {
    enterMenu();
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
    expect(window.location.pathname).toBe('/menu');
  });

  it('„Готово“ маха записа: следващото „назад“ напуска екрана', async () => {
    const user = userEvent.setup();
    render(<Screen />);
    await user.click(screen.getByRole('button', { name: 'Отвори' }));
    await user.click(screen.getByRole('button', { name: 'Готово' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(window.history.state).toBeNull());

    await back();

    expect(window.location.pathname).toBe('/');
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
    expect(window.location.pathname).toBe('/menu');

    await back();
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(window.location.pathname).toBe('/menu');

    await back();
    expect(window.location.pathname).toBe('/');
  });

  describe('с router-а', () => {
    let destroy = () => {};
    afterEach(() => destroy());

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
      expect(window.location.pathname).toBe('/recipes/7');
    });
  });
});
