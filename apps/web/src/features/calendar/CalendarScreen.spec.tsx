import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dani, fixtureNow, server } from '../../test/msw';
import { goOffline } from '../../test/network';
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

  describe('без връзка', () => {
    let reconnect: (() => void) | undefined;

    afterEach(() => {
      reconnect?.();
      reconnect = undefined;
    });

    /** Едно отваряне с връзка (събитията влизат в кеша), после сървърът не се достига. */
    async function openedOnceThenUnreachable() {
      const first = renderApp('/calendar');
      await screen.findByText('Родителска среща');
      first.unmount();
      server.use(
        http.get('/api/calendar/events', () => HttpResponse.error()),
        http.get('/api/dashboard', () => HttpResponse.error()),
      );
    }

    it('офлайн отваряне показва последните заредени дни с „остарели данни“', async () => {
      setUpDevice('phone', dani.id);
      await openedOnceThenUnreachable();
      vi.setSystemTime(new Date(fixtureNow.getTime() + 12 * 60_000));
      reconnect = goOffline();

      renderApp('/calendar');

      expect(
        await screen.findByText('остарели данни · от 12 мин'),
      ).toBeInTheDocument();
      const today = screen.getByRole('region', { name: 'сряда, 4 ноември' });
      expect(within(today).getByText('Родителска среща')).toBeInTheDocument();
      expect(
        screen.queryByText('Няма връзка със сървъра'),
      ).not.toBeInTheDocument();
    });

    it('мрежова грешка без събитие offline също показва кеша', async () => {
      setUpDevice('phone', dani.id);
      await openedOnceThenUnreachable();

      renderApp('/calendar');

      expect(
        await screen.findByText('остарели данни · от 1 мин'),
      ).toBeInTheDocument();
      expect(screen.getByText('Родителска среща')).toBeInTheDocument();
    });

    it('без кеш и без мрежа казва „Няма връзка със сървъра“, а не чака без край', async () => {
      setUpDevice('phone', dani.id);
      reconnect = goOffline();

      renderApp('/calendar');

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Няма връзка със сървъра',
      );
    });

    it('щом връзката се върне, календарът се опреснява и „остарели данни“ изчезва', async () => {
      setUpDevice('phone', dani.id);
      await openedOnceThenUnreachable();
      const goBackOnline = goOffline();
      renderApp('/calendar');
      await screen.findByText('остарели данни · от 1 мин');

      server.resetHandlers();
      goBackOnline();

      await waitFor(() =>
        expect(screen.queryByText(/остарели данни/)).not.toBeInTheDocument(),
      );
      expect(screen.getByText('Родителска среща')).toBeInTheDocument();
    });

    it('след мрежова грешка без offline, събитието online пак опреснява', async () => {
      setUpDevice('phone', dani.id);
      await openedOnceThenUnreachable();
      renderApp('/calendar');
      await screen.findByText('остарели данни · от 1 мин');

      server.resetHandlers();
      act(() => {
        window.dispatchEvent(new Event('online'));
      });

      await waitFor(() =>
        expect(screen.queryByText(/остарели данни/)).not.toBeInTheDocument(),
      );
    });

    it('„Обнови“ е изключено с „Иска връзка“', async () => {
      setUpDevice('phone', dani.id);
      renderApp('/calendar');
      await screen.findByText('Родителска среща');

      reconnect = goOffline();

      expect(
        await screen.findByRole('button', { name: 'Иска връзка' }),
      ).toBeDisabled();
    });
  });
});
