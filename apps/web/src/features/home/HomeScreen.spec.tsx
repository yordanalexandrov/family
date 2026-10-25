import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiError, dani, server } from '../../test/msw';
import { renderApp } from '../../test/render';

const KEY = 'family.actingUserId';

describe('HomeScreen', () => {
  it('с избран потребител показва „Здравей, Дани“ с аватар', async () => {
    localStorage.setItem(KEY, dani.id);

    renderApp('/');

    expect(
      await screen.findByRole('heading', { name: 'Здравей, Дани' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Д')).toBeInTheDocument();
  });

  it('без избран потребител води към „Кой си?“', async () => {
    renderApp('/');

    expect(
      await screen.findByRole('heading', { name: 'Кой си?' }),
    ).toBeInTheDocument();
  });

  it('при 400 unknown_acting_user чисти localStorage и показва „Кой си?“', async () => {
    localStorage.setItem(KEY, '33333333-3333-4333-8333-333333333333');

    renderApp('/');

    expect(
      await screen.findByRole('heading', { name: 'Кой си?' }),
    ).toBeInTheDocument();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('при 401 показва, че сесията е изтекла', async () => {
    localStorage.setItem(KEY, dani.id);
    server.use(
      http.get('/api/me', () =>
        apiError(401, 'invalid_access_token', 'Невалиден Access токен'),
      ),
    );

    renderApp('/');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Сесията е изтекла, презареди страницата',
    );
    expect(localStorage.getItem(KEY)).toBe(dani.id);
  });

  it('при друга грешка показва message от api и „Опитай пак“ презарежда', async () => {
    const user = userEvent.setup();
    localStorage.setItem(KEY, dani.id);
    server.use(
      http.get(
        '/api/me',
        () => apiError(500, 'internal_error', 'Вътрешна грешка'),
        { once: true },
      ),
    );

    renderApp('/');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Вътрешна грешка',
    );
    await user.click(screen.getByRole('button', { name: 'Опитай пак' }));
    expect(
      await screen.findByRole('heading', { name: 'Здравей, Дани' }),
    ).toBeInTheDocument();
  });

  it('„Смени“ води към „Кой си?“', async () => {
    const user = userEvent.setup();
    localStorage.setItem(KEY, dani.id);

    renderApp('/');

    await user.click(await screen.findByRole('link', { name: 'Смени' }));
    expect(
      await screen.findByRole('heading', { name: 'Кой си?' }),
    ).toBeInTheDocument();
  });
});
