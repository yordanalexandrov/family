import type { CalendarEvent, DashboardResponse } from '@family/shared';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  apiError,
  dashboard,
  dashboardWith,
  fixtureNow,
  server,
} from '../../test/msw';
import { renderApp, setUpDevice } from '../../test/render';

async function region(name: string) {
  return within(await screen.findByRole('region', { name }));
}

function respondWith(body: DashboardResponse) {
  server.use(http.get('/api/dashboard', () => HttpResponse.json(body)));
}

/** `count` предстоящи събития днес, по едно на час от 11:00 софийско време. */
function upcomingToday(count: number): CalendarEvent[] {
  const source = dashboard.days[0]?.events[1]?.sources ?? [];
  return Array.from({ length: count }, (_, i) => ({
    id: `f0000000-0000-4000-8000-00000000000${i}`,
    title: `Събитие ${i + 1}`,
    start: new Date(Date.UTC(2026, 10, 4, 9 + i)).toISOString(),
    end: new Date(Date.UTC(2026, 10, 4, 9 + i, 30)).toISOString(),
    allDay: false,
    sources: source,
  }));
}

describe('KioskLayout', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(fixtureNow);
    setUpDevice('kiosk');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('рендерира ядро, бюджет и дни без долна навигация', async () => {
    renderApp('/');

    expect((await region('Днес накратко')).getByText('10:00')).toBeVisible();
    expect((await region('Бюджет')).getByText(/^370\s€$/)).toBeInTheDocument();
    expect(
      (await region('Следващите дни')).getByText('Фитнес'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Основна навигация' }),
    ).not.toBeInTheDocument();
  });

  it('7 предстоящи събития днес → ядрото показва 5 и „+2 още“', async () => {
    const [today, ...rest] = dashboard.days;
    if (!today) throw new Error('фикстурата има днес');
    respondWith(
      dashboardWith({
        days: [{ ...today, events: upcomingToday(7) }, ...rest],
      }),
    );

    renderApp('/');

    const core = await region('Днес накратко');
    expect(core.getByText('Събитие 5')).toBeInTheDocument();
    expect(core.queryByText('Събитие 6')).not.toBeInTheDocument();
    expect(core.getByText('+2 още')).toBeInTheDocument();
  });

  it('празните слотове не са в решетката', async () => {
    renderApp('/');

    await region('Днес накратко');
    const slots = [...document.querySelectorAll('[data-slot]')].map((slot) =>
      slot.getAttribute('data-slot'),
    );
    expect(slots).toEqual(['core', 'left-1', 'right-1']);
  });

  it('докосване на ядрото → „Календар“ с „Назад“; „Назад“ връща дашборда', async () => {
    const user = userEvent.setup();
    renderApp('/');

    await user.click(
      (await region('Днес накратко')).getByText('Днес се готви'),
    );

    expect(
      await screen.findByRole('heading', { name: 'Календар' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Назад' }));
    expect(await region('Днес накратко')).toBeTruthy();
  });

  it('докосване на „Следващите дни“ отваря календара', async () => {
    const user = userEvent.setup();
    renderApp('/');

    await user.click((await region('Следващите дни')).getByText('Фитнес'));

    expect(
      await screen.findByRole('heading', { name: 'Календар' }),
    ).toBeInTheDocument();
  });

  it('календарът се връща сам към дашборда след 60 с без докосване', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(fixtureNow);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp('/calendar');
    await screen.findByRole('region', { name: 'сряда, 4 ноември' });

    act(() => vi.advanceTimersByTime(45_000));
    await user.pointer({
      keys: '[MouseLeft]',
      target: screen.getByRole('heading', { name: 'Календар' }),
    });
    act(() => vi.advanceTimersByTime(45_000));
    expect(screen.getByRole('heading', { name: 'Календар' })).toBeVisible();

    act(() => vi.advanceTimersByTime(15_000));
    expect(await region('Днес накратко')).toBeTruthy();
  });

  it('бутонът за настройки в ъгъла води към „Настройки“', async () => {
    const user = userEvent.setup();
    renderApp('/');

    await user.click(await screen.findByRole('link', { name: 'Настройки' }));

    expect(
      await screen.findByRole('heading', { name: 'Настройки' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Назад' })).toBeVisible();
  });

  it('401 → цял екран „Сесията изтече · докосни за вход“', async () => {
    server.use(
      http.get('/api/dashboard', () =>
        apiError(401, 'invalid_access_token', 'Невалиден Access токен'),
      ),
    );

    renderApp('/');

    expect(
      await screen.findByRole('button', {
        name: 'Сесията изтече · докосни за вход',
      }),
    ).toBeVisible();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('пренасочване от Cloudflare Access (изтекла сесия) → екранът „Сесията изтече“, не офлайн', async () => {
    server.use(
      http.get('/api/dashboard', () =>
        HttpResponse.redirect(
          'https://access.example.com/cdn-cgi/access/login',
          302,
        ),
      ),
    );

    renderApp('/');

    expect(
      await screen.findByRole('button', {
        name: 'Сесията изтече · докосни за вход',
      }),
    ).toBeVisible();
    expect(
      screen.queryByText(/Няма връзка със сървъра/),
    ).not.toBeInTheDocument();
  });

  it('при смяна на датата зарежда данните веднага', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // 23:59:50 в София.
    vi.setSystemTime(new Date('2026-11-04T21:59:50.000Z'));
    let requests = 0;
    server.use(
      http.get('/api/dashboard', () => {
        requests += 1;
        return HttpResponse.json(dashboard);
      }),
    );
    renderApp('/');
    await region('Днес накратко');
    expect(requests).toBe(1);

    act(() => vi.advanceTimersByTime(30_000));

    await vi.waitFor(() => expect(requests).toBe(2));
  });
  it('остарял календар → ядрото носи жълтия надпис като на телефона', async () => {
    respondWith(
      dashboardWith({
        sync: {
          ...dashboard.sync,
          calendar: {
            source: 'calendar',
            status: 'failed',
            lastSuccessAt: new Date(
              fixtureNow.getTime() - 25 * 60_000,
            ).toISOString(),
            lastError: 'Google Calendar отговори с 503',
          },
        },
      }),
    );

    renderApp('/');

    expect(
      (await region('Днес накратко')).getByText(
        'Google Calendar не отговаря · данни от преди 25 мин',
      ),
    ).toBeInTheDocument();
  });

  it('без конфигурация на календара ядрото не показва кешираните събития', async () => {
    respondWith(
      dashboardWith({
        sync: {
          ...dashboard.sync,
          calendar: {
            source: 'calendar',
            status: 'unconfigured',
            lastSuccessAt: null,
            lastError: null,
          },
        },
      }),
    );

    renderApp('/');

    const core = await region('Днес накратко');
    expect(
      core.getByText('Google Calendar не е конфигуриран'),
    ).toBeInTheDocument();
    expect(core.queryByText('Обяд с колеги')).not.toBeInTheDocument();
    expect(core.queryByText('Рожден ден на баба')).not.toBeInTheDocument();
  });

  it('след полунощ, преди новите данни, ядрото показва събитията на новия ден', async () => {
    // 00:05 в четвъртък, 5 ноември в София; сървърът още отговаря с данните от сряда.
    vi.setSystemTime(new Date('2026-11-04T22:05:00.000Z'));

    renderApp('/');

    const core = await region('Днес накратко');
    expect(core.getByText('Фитнес')).toBeInTheDocument();
    expect(core.queryByText('Родителска среща')).not.toBeInTheDocument();
    expect(core.queryByText('Рожден ден на баба')).not.toBeInTheDocument();
    const next = await region('Следващите дни');
    expect(next.queryByText('Фитнес')).not.toBeInTheDocument();
    expect(next.getByText('Екскурзия до планината')).toBeInTheDocument();
  });
});
