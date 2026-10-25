import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { poli } from '../../test/msw';
import { renderApp, setUpDevice } from '../../test/render';

describe('WhoScreen', () => {
  beforeEach(() => {
    setUpDevice('phone');
  });

  it('показва „Кой си?“ с аватар за всеки потребител', async () => {
    renderApp('/who');

    expect(
      await screen.findByRole('heading', { name: 'Кой си?' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Дани' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Поли' })).toBeVisible();
    expect(screen.getByText('Д')).toBeInTheDocument();
    expect(screen.getByText('П')).toBeInTheDocument();
  });

  it('клик на „Поли“ записва id в localStorage и води към дашборда', async () => {
    const user = userEvent.setup();
    renderApp('/who');

    await user.click(await screen.findByRole('button', { name: 'Поли' }));

    expect(
      await screen.findByRole('region', { name: 'Днес накратко' }),
    ).toBeInTheDocument();
    expect(localStorage.getItem('family.actingUserId')).toBe(poli.id);
  });
});

describe('режим phone без действащ потребител', () => {
  it('всеки екран води към „Кой си?“', async () => {
    setUpDevice('phone');

    renderApp('/calendar');

    expect(
      await screen.findByRole('heading', { name: 'Кой си?' }),
    ).toBeInTheDocument();
  });

  it('kiosk не иска потребител', async () => {
    setUpDevice('kiosk');

    renderApp('/');

    expect(
      await screen.findByRole('region', { name: 'Днес накратко' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Кой си?' })).toBeNull();
  });
});
