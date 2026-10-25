import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dani, fixtureNow, server } from '../../test/msw';
import { renderApp, setUpDevice } from '../../test/render';

describe('CalendarScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(fixtureNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('показва 14 дни от днес по общите правила на календара', async () => {
    setUpDevice('phone', dani.id);
    let query: URLSearchParams | undefined;
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname === '/api/calendar/events') query = url.searchParams;
    });

    renderApp('/calendar');

    const today = await screen.findByRole('region', {
      name: 'сряда, 4 ноември',
    });
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(14);
    expect(query?.get('from')).toBe('2026-11-04');
    expect(query?.get('to')).toBe('2026-11-18');
    expect(within(today).getByText('Родителска среща')).toBeInTheDocument();
    expect(
      within(
        screen.getByRole('region', { name: 'събота, 7 ноември' }),
      ).getByText('цял ден'),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole('region', { name: 'неделя, 8 ноември' }),
      ).getByText('продължава'),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole('region', { name: 'вторник, 17 ноември' }),
      ).getByText('Нищо планирано'),
    ).toBeInTheDocument();
    server.events.removeAllListeners();
  });

  it('„Обнови“ праща POST /api/sync/calendar и показва резултата', async () => {
    const user = userEvent.setup();
    setUpDevice('phone', dani.id);
    const sync = vi.fn();
    server.use(
      http.post('/api/sync/calendar', ({ request }) => {
        sync(request.headers.get('x-acting-user'));
        return HttpResponse.json({
          source: 'calendar',
          status: 'ok',
          durationMs: 420,
        });
      }),
    );
    renderApp('/calendar');

    await user.click(await screen.findByRole('button', { name: 'Обнови' }));

    expect(await screen.findByText('Календарът е обновен')).toBeInTheDocument();
    expect(sync).toHaveBeenCalledWith(dani.id);
  });

  it('без режим phone няма „Обнови“', async () => {
    setUpDevice('kiosk');

    renderApp('/calendar');

    await screen.findByRole('region', { name: 'сряда, 4 ноември' });
    expect(
      screen.queryByRole('button', { name: 'Обнови' }),
    ).not.toBeInTheDocument();
  });
});
