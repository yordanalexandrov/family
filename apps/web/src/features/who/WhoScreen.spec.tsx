import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { poli } from '../../test/msw';
import { renderApp } from '../../test/render';

describe('WhoScreen', () => {
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

  it('клик на „Поли“ записва id в localStorage и води към „Здравей, Поли“', async () => {
    const user = userEvent.setup();
    renderApp('/who');

    await user.click(await screen.findByRole('button', { name: 'Поли' }));

    expect(
      await screen.findByRole('heading', { name: 'Здравей, Поли' }),
    ).toBeInTheDocument();
    expect(localStorage.getItem('family.actingUserId')).toBe(poli.id);
  });
});
