import type { ServerEvent } from '@family/shared';
import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextWeek, planFor, servePlans, thisWeek } from '../test/menu';
import { dani, fixtureNow } from '../test/msw';
import { renderApp, setUpDevice } from '../test/render';
import { serveShopping, shoppingList } from '../test/shopping';

/** `EventSource` без мрежа: тестът отваря връзката и праща събития като api-то. */
class MockEventSource extends EventTarget {
  static instances: MockEventSource[] = [];
  readonly url: string;
  closed = false;

  constructor(url: string) {
    super();
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  open() {
    this.dispatchEvent(new Event('open'));
  }

  error() {
    this.dispatchEvent(new Event('error'));
  }

  send(event: ServerEvent) {
    this.dispatchEvent(
      new MessageEvent(event.type, { data: JSON.stringify(event) }),
    );
  }
}

/** Единствената отворена връзка на приложението. */
function source(): MockEventSource {
  const open = MockEventSource.instances.filter((s) => !s.closed);
  expect(open).toHaveLength(1);
  return open[0] as MockEventSource;
}

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
