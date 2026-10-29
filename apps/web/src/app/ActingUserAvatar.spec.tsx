import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { servePlans } from '../test/menu';
import { dani, poli } from '../test/msw';
import { servePantry } from '../test/pantry';
import { servePushApi, stubPushBrowser } from '../test/push';
import { renderApp, setUpDevice } from '../test/render';
import { serveShopping } from '../test/shopping';

describe('аватарът на действащия човек', () => {
  it.each(['/', '/calendar', '/recipes', '/menu', '/shopping', '/pantry'])(
    'на %s казва кой си и води към „Кой си?“',
    async (path) => {
      setUpDevice('phone', dani.id);
      servePlans();
      serveShopping();
      servePantry();
      renderApp(path);

      const avatar = await screen.findByRole('link', {
        name: 'Ти си Дани · смени',
      });
      expect(avatar).toHaveAttribute('href', '/who');
      expect(avatar).toHaveTextContent('Д');
    },
  );

  it('след смяна на човека от аватара казва „Сега си Поли“', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    renderApp('/');

    await user.click(
      await screen.findByRole('link', { name: 'Ти си Дани · смени' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Поли' }));

    expect(await screen.findByText('Сега си Поли')).toBeVisible();
    expect(
      await screen.findByRole('link', { name: 'Ти си Поли · смени' }),
    ).toBeInTheDocument();
  });

  it('след „По-късно“ смяната от аватара не пита пак за напомняния', async () => {
    stubPushBrowser();
    servePushApi();
    localStorage.setItem('family.pushPromptDismissed', 'true');
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    renderApp('/');

    await user.click(
      await screen.findByRole('link', { name: 'Ти си Дани · смени' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Поли' }));

    expect(await screen.findByText('Сега си Поли')).toBeVisible();
    expect(
      await screen.findByRole('region', { name: 'Днес накратко' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Искаш ли напомняния?' }),
    ).toBeNull();
    expect(localStorage.getItem('family.actingUserId')).toBe(poli.id);
  });

  it('първият избор на „Кой си?“ не е смяна: без toast', async () => {
    const user = userEvent.setup();
    setUpDevice('phone');
    renderApp('/who');

    await user.click(await screen.findByRole('button', { name: 'Поли' }));

    expect(
      await screen.findByRole('link', { name: 'Ти си Поли · смени' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Сега си Поли')).toBeNull();
  });

  it('kiosk няма действащ човек и няма аватар', async () => {
    setUpDevice('kiosk');
    renderApp('/calendar');

    expect(
      await screen.findByRole('heading', { name: 'Календар' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Ти си/ })).toBeNull();
  });
});
