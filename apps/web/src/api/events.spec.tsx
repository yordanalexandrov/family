import { act, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../logger';
import { MockEventSource, source } from '../test/events';
import {
  nextWeek,
  noProposal,
  pendingProposal,
  planFor,
  servePlans,
  serveWeekProposal,
  thisWeek,
} from '../test/menu';
import { dani, dashboard, fixtureNow, poli, server } from '../test/msw';
import { renderApp, setUpDevice } from '../test/render';
import { serveShopping, shoppingList } from '../test/shopping';

/** Заявките, получени след `from`. */
function since<T>(requests: T[], from: number): T[] {
  return requests.slice(from);
}

describe('useServerEvents', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(fixtureNow);
    setUpDevice('phone', dani.id);
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('слуша /api/events', async () => {
    servePlans({ [thisWeek]: planFor(thisWeek) });

    renderApp('/menu');

    await screen.findByRole('tab', { name: 'Тази седмица' });
    expect(source().url).toBe('/api/events');
  });

  it('menu.changed презарежда менюто на своята седмица, не на друга', async () => {
    const asked = servePlans({ [thisWeek]: planFor(thisWeek) });
    renderApp('/menu');
    await screen.findAllByText('Избери ястие');
    source().open();
    const before = asked.length;

    act(() => source().send({ type: 'menu.changed', weekStart: nextWeek }));
    act(() => source().send({ type: 'menu.changed', weekStart: thisWeek }));

    await vi.waitFor(() => expect(since(asked, before)).toEqual([thisWeek]));
  });

  it('menu.changed презарежда и дашборда (готвачът на другия телефон)', async () => {
    let gets = 0;
    server.use(
      http.get('/api/dashboard', () => {
        gets += 1;
        return HttpResponse.json(dashboard);
      }),
    );
    renderApp('/');
    await screen.findByText('Днес се готви');
    source().open();
    const before = gets;

    act(() => source().send({ type: 'menu.changed', weekStart: thisWeek }));

    await vi.waitFor(() => expect(gets).toBe(before + 1));
  });

  it('menu.proposal.changed показва чакащото предложение на другия, без да се чака следващо питане', async () => {
    setUpDevice('phone', poli.id);
    servePlans();
    renderApp('/menu');
    await screen.findByRole('button', { name: 'Предложи меню' });
    source().open();
    serveWeekProposal(pendingProposal);

    act(() =>
      source().send({ type: 'menu.proposal.changed', weekStart: thisWeek }),
    );

    expect(await screen.findByText('Дани съставя меню…')).toBeInTheDocument();
  });

  it('Дани стои на неуспешното си предложение, Поли иска ново: Дани вижда чакането, после готовия план', async () => {
    const failed = {
      ...pendingProposal,
      status: 'failed' as const,
      error: 'http_500' as const,
      finishedAt: '2026-11-04T08:00:05.000Z',
    };
    const polis = {
      ...pendingProposal,
      id: 'ffffffff-0000-4000-8000-0000000000a1',
      requestedBy: poli.id,
      hint: 'без риба',
      createdAt: '2026-11-04T08:01:00.000Z',
    };
    let latest: typeof pendingProposal = failed;
    const plans: Record<string, ReturnType<typeof planFor>> = {};
    servePlans(plans);
    server.use(
      http.get(`/api/menu/proposals/${pendingProposal.id}`, () =>
        HttpResponse.json({ proposal: failed }),
      ),
      http.get('/api/menu/proposals', () =>
        HttpResponse.json({ proposal: latest }),
      ),
    );
    renderApp(`/menu?proposal=${pendingProposal.id}`);
    expect(
      await screen.findByRole('button', { name: 'Опитай пак' }),
    ).toBeEnabled();
    source().open();

    latest = polis;
    act(() =>
      source().send({ type: 'menu.proposal.changed', weekStart: thisWeek }),
    );
    expect(await screen.findByText('Поли съставя меню…')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Предложи меню' }),
    ).toBeDisabled();

    plans[thisWeek] = planFor(thisWeek, {}, { summary: 'Седмица без риба.' });
    latest = {
      ...polis,
      status: 'done',
      planId: plans[thisWeek].id,
      finishedAt: '2026-11-04T08:02:00.000Z',
    };
    act(() =>
      source().send({ type: 'menu.proposal.changed', weekStart: thisWeek }),
    );
    act(() => source().send({ type: 'menu.changed', weekStart: thisWeek }));

    expect(await screen.findByText('Седмица без риба.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('бързо следващ menu.proposal.changed (предложението падна веднага) не оставя CancelledError в конзолата', async () => {
    const warn = vi.spyOn(logger, 'warn');
    servePlans();
    let latest: typeof pendingProposal | undefined;
    server.use(
      http.get('/api/menu/proposals', async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return latest ? HttpResponse.json({ proposal: latest }) : noProposal();
      }),
    );
    renderApp('/menu');
    await screen.findByRole('button', { name: 'Предложи меню' });
    source().open();

    latest = pendingProposal;
    act(() =>
      source().send({ type: 'menu.proposal.changed', weekStart: thisWeek }),
    );
    latest = { ...pendingProposal, status: 'failed', error: 'http_500' };
    act(() =>
      source().send({ type: 'menu.proposal.changed', weekStart: thisWeek }),
    );

    expect(
      await screen.findByRole('button', { name: 'Опитай пак' }),
    ).toBeEnabled();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('shopping.changed презарежда списъка на своята седмица', async () => {
    const { gets } = serveShopping({ [thisWeek]: shoppingList() });
    renderApp('/shopping');
    await screen.findByText('5 от 6');
    source().open();
    const before = gets.length;

    act(() => source().send({ type: 'shopping.changed', weekStart: nextWeek }));
    act(() => source().send({ type: 'shopping.changed', weekStart: thisWeek }));

    await vi.waitFor(() => expect(since(gets, before)).toEqual([thisWeek]));
  });

  it('shopping.changed без седмица (килерът) презарежда списъка, която и седмица да е', async () => {
    const { gets } = serveShopping({ [thisWeek]: shoppingList() });
    renderApp('/shopping');
    await screen.findByText('5 от 6');
    source().open();
    const before = gets.length;

    act(() => source().send({ type: 'shopping.changed' }));

    await vi.waitFor(() => expect(since(gets, before)).toEqual([thisWeek]));
  });

  it('след прекъсване и повторна връзка презарежда менюто', async () => {
    const asked = servePlans({ [thisWeek]: planFor(thisWeek) });
    renderApp('/menu');
    await screen.findAllByText('Избери ястие');
    source().open();
    const before = asked.length;

    act(() => source().error());
    expect(since(asked, before)).toEqual([]);
    act(() => source().open());

    await vi.waitFor(() => expect(since(asked, before)).toEqual([thisWeek]));
  });

  it('при връщане към приложението презарежда менюто', async () => {
    const asked = servePlans({ [thisWeek]: planFor(thisWeek) });
    renderApp('/menu');
    await screen.findAllByText('Избери ястие');
    const before = asked.length;
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await vi.waitFor(() => expect(since(asked, before)).toEqual([thisWeek]));
  });
});
