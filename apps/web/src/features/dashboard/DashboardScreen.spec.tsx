import type { DashboardResponse } from '@family/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  apiError,
  dani,
  dashboard,
  dashboardWith,
  fixtureNow,
  server,
} from '../../test/msw';
import { renderApp, setUpDevice } from '../../test/render';

const CACHE_KEY = 'family.dashboardCache';

function minutesBefore(minutes: number): string {
  return new Date(fixtureNow.getTime() - minutes * 60_000).toISOString();
}

function respondWith(body: DashboardResponse) {
  server.use(http.get('/api/dashboard', () => HttpResponse.json(body)));
}

async function core() {
  return within(await screen.findByRole('region', { name: 'Днес накратко' }));
}

async function card(name: string) {
  return within(await screen.findByRole('region', { name }));
}

describe('DashboardScreen', () => {
  beforeEach(() => {
    // Само часовникът е фиксиран (10:00 в София); таймерите вървят истински.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(fixtureNow);
    setUpDevice('phone', dani.id);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ядрото показва часовник без секунди, дата и „Днес се готви“ с „—“', async () => {
    renderApp('/');

    const inCore = await core();
    expect(inCore.getByText('10:00')).toBeInTheDocument();
    expect(inCore.getByText('сряда, 4 ноември')).toBeInTheDocument();
    expect(inCore.getByText('Днес се готви')).toBeInTheDocument();
    expect(inCore.getByText('—')).toBeInTheDocument();
  });

  it('целодневното събитие е чип в ядрото, следващото събитие е под датата', async () => {
    renderApp('/');

    const inCore = await core();
    expect(inCore.getByText('Рожден ден на баба')).toBeInTheDocument();
    expect(inCore.getByText('Обяд с колеги')).toBeInTheDocument();
    expect(inCore.queryByText('Родителска среща')).not.toBeInTheDocument();
  });

  it('рендерира четирите дни: днешните събития и следващите три дни', async () => {
    renderApp('/');

    const today = await card('Днес');
    expect(today.getByText('Зъболекар')).toBeInTheDocument();
    expect(today.getByText('Родителска среща')).toBeInTheDocument();
    const nextDays = await card('Следващите дни');
    expect(nextDays.getByText('5 ноември')).toBeInTheDocument();
    expect(nextDays.getByText('6 ноември')).toBeInTheDocument();
    expect(nextDays.getByText('7 ноември')).toBeInTheDocument();
    expect(nextDays.getByText('Фитнес')).toBeInTheDocument();
    expect(nextDays.getByText('Заето')).toBeInTheDocument();
    expect(nextDays.getByText('Нищо планирано')).toBeInTheDocument();
  });

  it('поканата от два източника има два аватара, семейното събитие има „С“', async () => {
    renderApp('/');

    const today = await card('Днес');
    const invitation = today.getByText('Родителска среща').closest('li');
    expect(invitation).not.toBeNull();
    expect(
      within(invitation as HTMLElement).getByText('Д'),
    ).toBeInTheDocument();
    expect(
      within(invitation as HTMLElement).getByText('П'),
    ).toBeInTheDocument();
    const birthday = today.getByText('Рожден ден на баба').closest('li');
    expect(within(birthday as HTMLElement).getByText('С')).toBeInTheDocument();
  });

  it('днешното минало събитие е приглушено, следващото предстоящо е подчертано', async () => {
    renderApp('/');

    const today = await card('Днес');
    expect(today.getByText('Зъболекар').closest('li')).toHaveAttribute(
      'data-state',
      'past',
    );
    expect(today.getByText('Обяд с колеги').closest('li')).toHaveAttribute(
      'data-state',
      'next',
    );
    expect(today.getByText('18:30')).toBeInTheDocument();
  });

  it('остатъкът е форматиран във валутата от Wallet', async () => {
    renderApp('/');

    const budget = await card('Бюджет');
    expect(budget.getByText(/^370\s€$/)).toBeInTheDocument();
    expect(budget.getByText(/похарчени/)).toHaveTextContent(
      /похарчени 831\s€ от 1200\s€/,
    );
    // 369,5 € за 27 дни (4–30 ноември включително).
    expect(budget.getByText(/до края/)).toHaveTextContent(
      /~14\s€\/ден до края/,
    );
  });

  it('stale календар → жълт надпис „… не отговаря · данни от преди 25 мин“', async () => {
    respondWith(
      dashboardWith({
        sync: {
          ...dashboard.sync,
          calendar: {
            source: 'calendar',
            status: 'stale',
            lastSuccessAt: minutesBefore(25),
            lastError: null,
          },
        },
      }),
    );

    renderApp('/');

    const today = await card('Днес');
    expect(
      today.getByText('Google Calendar не отговаря · данни от преди 25 мин'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Календар: остарели данни' }),
    ).toBeInTheDocument();
  });

  it('превишен бюджет → числото и лентата в цвета за опасност, „превишен с 50 €“ вместо темпото', async () => {
    const budget = dashboard.budget;
    if (!budget) throw new Error('фикстурата има бюджет');
    respondWith(
      dashboardWith({
        budget: { ...budget, spent: 1250, remaining: -50 },
      }),
    );

    renderApp('/');

    const panel = await card('Бюджет');
    const amount = panel.getByText(/^-50\s€$/);
    expect(amount).toHaveClass('budget__amount--danger');
    expect(panel.getByRole('meter').closest('.budget__bar')).toHaveClass(
      'budget__bar--danger',
    );
    expect(panel.getByText(/превишен/)).toHaveTextContent(/^превишен с 50\s€$/);
    expect(panel.queryByText(/до края/)).not.toBeInTheDocument();
  });

  it('budget: null → „—“ и „няма данни от Wallet“', async () => {
    respondWith(dashboardWith({ budget: null }));

    renderApp('/');

    const panel = await card('Бюджет');
    expect(panel.getByText('—')).toBeInTheDocument();
    expect(panel.getByText('няма данни от Wallet')).toBeInTheDocument();
  });

  it('без конфигурация трите карти казват „… не е конфигуриран“', async () => {
    respondWith(
      dashboardWith({
        days: dashboard.days.map(({ date }) => ({ date, events: [] })),
        budget: null,
        sync: {
          calendar: {
            source: 'calendar',
            status: 'unconfigured',
            lastSuccessAt: null,
            lastError: null,
          },
          budget: {
            source: 'budget',
            status: 'unconfigured',
            lastSuccessAt: null,
            lastError: null,
          },
        },
      }),
    );

    renderApp('/');

    expect(
      (await card('Днес')).getByText('Google Calendar не е конфигуриран'),
    ).toBeInTheDocument();
    expect(
      (await card('Следващите дни')).getByText(
        'Google Calendar не е конфигуриран',
      ),
    ).toBeInTheDocument();
    const budget = await card('Бюджет');
    expect(budget.getByText('—')).toBeInTheDocument();
    expect(budget.getByText('Wallet не е конфигуриран')).toBeInTheDocument();
  });

  it('след полунощ офлайн „Днес“ е новият ден от кеша, не вчерашният', async () => {
    const first = renderApp('/');
    await screen.findByText('Родителска среща');
    first.unmount();

    // 00:05 в четвъртък, 5 ноември в София; кешът е от сряда.
    vi.setSystemTime(new Date('2026-11-04T22:05:00.000Z'));
    server.use(http.get('/api/dashboard', () => HttpResponse.error()));
    renderApp('/');

    const today = await card('Днес');
    expect(await today.findByText('Фитнес')).toBeInTheDocument();
    expect(today.queryByText('Родителска среща')).not.toBeInTheDocument();
    expect(
      (await core()).getByText('четвъртък, 5 ноември'),
    ).toBeInTheDocument();
  });

  it('при мрежова грешка показва последния успешен отговор с банер', async () => {
    const first = renderApp('/');
    await screen.findByText('Родителска среща');
    first.unmount();
    expect(localStorage.getItem(CACHE_KEY)).not.toBeNull();

    vi.setSystemTime(new Date(fixtureNow.getTime() + 12 * 60_000));
    server.use(http.get('/api/dashboard', () => HttpResponse.error()));
    renderApp('/');

    expect(
      await screen.findByText(
        'Няма връзка със сървъра · данни от преди 12 мин',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Родителска среща')).toBeInTheDocument();
  });

  it('при 5xx без кеш показва грешка, „Опитай пак“ зарежда наново', async () => {
    const user = userEvent.setup();
    server.use(
      http.get(
        '/api/dashboard',
        () => apiError(500, 'internal_error', 'Вътрешна грешка'),
        { once: true },
      ),
    );

    renderApp('/');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Вътрешна грешка',
    );
    await user.click(screen.getByRole('button', { name: 'Опитай пак' }));
    expect(await screen.findByText('Родителска среща')).toBeInTheDocument();
  });

  it('при 401 показва, че сесията е изтекла, без да показва кеша', async () => {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ fetchedAt: minutesBefore(5), data: dashboard }),
    );
    server.use(
      http.get('/api/dashboard', () =>
        apiError(401, 'invalid_access_token', 'Невалиден Access токен'),
      ),
    );

    renderApp('/');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Сесията е изтекла, презареди страницата',
    );
  });

  it('докосване на сегмент от пръстена превърта списъка до събитието', async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    renderApp('/');

    await user.click(
      await screen.findByRole('link', { name: '18:30 Родителска среща' }),
    );

    const item = (await card('Днес'))
      .getByText('Родителска среща')
      .closest('li');
    expect(scrollIntoView).toHaveBeenCalled();
    expect(scrollIntoView.mock.contexts[0]).toBe(item);
  });

  it('има долна навигация към календара, рецептите и настройките', async () => {
    renderApp('/');

    const nav = await screen.findByRole('navigation', {
      name: 'Основна навигация',
    });
    expect(within(nav).getByRole('link', { name: 'Дашборд' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Календар' })).toBeVisible();
    expect(within(nav).getByRole('link', { name: 'Рецепти' })).toBeVisible();
    expect(within(nav).getByRole('link', { name: 'Настройки' })).toBeVisible();
  });
});
