import { act, cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockEventSource, source } from '../test/events';
import {
  nextWeek,
  pendingProposal,
  planFor,
  servePlans,
  serveWeekProposal,
} from '../test/menu';
import { dani, fixtureNow, poli } from '../test/msw';
import { renderApp, setUpDevice } from '../test/render';

const LABELS = [
  'Дашборд',
  'Календар',
  'Рецепти',
  'Меню',
  'Пазаруване',
  'Килер',
  'Настройки',
];

describe('MainNav на телефона', () => {
  beforeEach(() => {
    setUpDevice('phone', dani.id);
  });

  it('седем екрана, всеки с икона и достъпно име, текущият е отбелязан', async () => {
    renderApp('/settings');

    const nav = await screen.findByRole('navigation', {
      name: 'Основна навигация',
    });
    const links = within(nav).getAllByRole('link');

    expect(links.map((link) => link.textContent)).toEqual(LABELS);
    expect(links.map((link) => link.getAttribute('aria-current'))).toEqual([
      ...Array(6).fill(null),
      'page',
    ]);
    for (const label of LABELS) {
      const link = within(nav).getByRole('link', { name: label });
      expect(link.querySelector('svg')).not.toBeNull();
    }
  });
});

describe('MainNav: точка на „Меню“ за ново предложение', () => {
  const plan = planFor(nextWeek, {}, { summary: 'Седмица с риба.' });
  const doneByDani = {
    ...pendingProposal,
    weekStart: nextWeek,
    status: 'done' as const,
    planId: plan.id,
    finishedAt: '2026-11-04T08:01:00.000Z',
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(fixtureNow);
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource);
    servePlans({ [nextWeek]: plan });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function openSettings() {
    renderApp('/settings');
    const nav = await screen.findByRole('navigation', {
      name: 'Основна навигация',
    });
    source().open();
    return nav;
  }

  it('готовото предложение на другия слага точка; отварянето на Меню я маха', async () => {
    setUpDevice('phone', poli.id);
    serveWeekProposal(doneByDani);
    const nav = await openSettings();

    act(() =>
      source().send({ type: 'menu.proposal.changed', weekStart: nextWeek }),
    );

    const menu = await within(nav).findByRole('link', {
      name: 'Меню, ново предложение',
    });
    await userEvent.click(menu);

    expect(await screen.findByText('Седмица с риба.')).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Меню' })).toBeInTheDocument();
  });

  it('точката остава на устройството след презареждане, докато седмицата не се отвори', async () => {
    setUpDevice('phone', poli.id);
    serveWeekProposal(doneByDani);
    const first = await openSettings();
    act(() =>
      source().send({ type: 'menu.proposal.changed', weekStart: nextWeek }),
    );
    await within(first).findByRole('link', { name: 'Меню, ново предложение' });
    cleanup();

    const again = await openSettings();

    expect(
      within(again).getByRole('link', { name: 'Меню, ново предложение' }),
    ).toBeInTheDocument();
  });

  it('видяното е на човека: на споделеното устройство другият не вижда точката на Поли', async () => {
    setUpDevice('phone', poli.id);
    serveWeekProposal(doneByDani);
    const first = await openSettings();
    act(() =>
      source().send({ type: 'menu.proposal.changed', weekStart: nextWeek }),
    );
    await within(first).findByRole('link', { name: 'Меню, ново предложение' });
    cleanup();

    setUpDevice('phone', dani.id);
    const asDani = await openSettings();
    expect(
      within(asDani).getByRole('link', { name: 'Меню' }),
    ).toBeInTheDocument();
    cleanup();

    setUpDevice('phone', poli.id);
    const asPoli = await openSettings();
    expect(
      within(asPoli).getByRole('link', { name: 'Меню, ново предложение' }),
    ).toBeInTheDocument();
  });

  it('своето предложение и чакащото не слагат точка', async () => {
    setUpDevice('phone', dani.id);
    const asked = serveWeekProposal(
      { ...doneByDani, status: 'pending' },
      doneByDani,
    );
    const nav = await openSettings();

    for (let i = 0; i < 2; i += 1) {
      act(() =>
        source().send({ type: 'menu.proposal.changed', weekStart: nextWeek }),
      );
      await vi.waitFor(() => expect(asked()).toBe(i + 1));
    }

    expect(within(nav).getByRole('link', { name: 'Меню' })).toBeInTheDocument();
  });
});
