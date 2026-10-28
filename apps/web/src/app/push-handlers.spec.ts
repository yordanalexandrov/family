import type { PushPayload } from '@family/shared';
import { describe, expect, it } from 'vitest';
import {
  type AppWindow,
  type NotificationShowOptions,
  onNotificationClick,
  onPush,
  type PushWorker,
} from './push-handlers';

const DANI = '11111111-1111-4111-8111-111111111111';
const ORIGIN = 'https://family.test';

const thaw: PushPayload = {
  kind: 'thaw',
  title: 'Извади месото',
  body: 'За утре: мусака',
  tag: 'thaw-meal-1',
  url: '/menu',
  userId: DANI,
  actions: [
    { action: 'thawed', title: 'Извадих', post: '/api/reminders/thaw/meal-1' },
  ],
};

interface FakeWindow extends AppWindow {
  focusedTimes: number;
  navigatedTo: string[];
}

function fakeWindow(
  state: Partial<Pick<AppWindow, 'visibilityState' | 'focused'>> = {},
): FakeWindow {
  const win: FakeWindow = {
    visibilityState: state.visibilityState ?? 'visible',
    focused: state.focused ?? true,
    focusedTimes: 0,
    navigatedTo: [],
    focus: async () => {
      win.focusedTimes += 1;
    },
    navigate: async (url) => {
      win.navigatedTo.push(url);
    },
  };
  return win;
}

/** Service worker-ът, както го вижда `push-handlers`: какво е показал, отворил и поискал от api-то. */
function fakeWorker({
  windows = [],
  answer = () => new Response(null, { status: 204 }),
}: {
  windows?: FakeWindow[];
  answer?: () => Response | Promise<Response>;
} = {}) {
  const shown: { title: string; options: NotificationShowOptions }[] = [];
  const opened: string[] = [];
  const requests: { url: string; init: RequestInit }[] = [];
  const worker: PushWorker = {
    origin: ORIGIN,
    showNotification: async (title, options) => {
      shown.push({ title, options });
    },
    windows: async () => windows,
    openWindow: async (url) => {
      opened.push(url);
    },
    fetch: async (url, init) => {
      requests.push({ url, init });
      return answer();
    },
  };
  return { worker, shown, opened, requests };
}

function message(data: unknown) {
  return { json: () => data };
}

describe('onPush', () => {
  it('shows the notification with its tag, buttons, icon and badge', async () => {
    const { worker, shown } = fakeWorker();

    await onPush(worker, message(thaw));

    expect(shown).toEqual([
      {
        title: 'Извади месото',
        options: {
          body: 'За утре: мусака',
          tag: 'thaw-meal-1',
          data: thaw,
          actions: [{ action: 'thawed', title: 'Извадих' }],
          icon: '/icons/icon-192.png',
          badge: '/icons/badge-96.png',
        },
      },
    ]);
  });

  it.each([
    [
      'a payload of another shape',
      message({ kind: 'thaw', title: 'Без потребител' }),
    ],
    [
      'a message that is not JSON',
      {
        json: () => {
          throw new SyntaxError('Unexpected token');
        },
      },
    ],
    ['a message without data', null],
  ])('shows nothing for %s', async (_, data) => {
    const { worker, shown } = fakeWorker();

    await onPush(worker, data);

    expect(shown).toEqual([]);
  });

  describe('a menu notification (Известие от Съгласуването)', () => {
    const menu: PushPayload = {
      kind: 'menu',
      title: 'Поли по менюто',
      body: '2 гласа, 1 коментар',
      tag: 'menu-2026-11-02',
      url: '/menu?week=2026-11-02',
      userId: DANI,
    };

    it('is not shown while the app is visible and focused, since the screen already shows it', async () => {
      const { worker, shown } = fakeWorker({
        windows: [
          fakeWindow({ visibilityState: 'hidden', focused: false }),
          fakeWindow(),
        ],
      });

      await onPush(worker, message(menu));

      expect(shown).toEqual([]);
    });

    it.each([
      ['no window is open', []],
      [
        'the window is hidden',
        [fakeWindow({ visibilityState: 'hidden', focused: false })],
      ],
      [
        'the window is visible but not focused',
        [fakeWindow({ focused: false })],
      ],
    ])('is shown when %s', async (_, windows) => {
      const { worker, shown } = fakeWorker({ windows });

      await onPush(worker, message(menu));

      expect(shown.map(({ title }) => title)).toEqual(['Поли по менюто']);
    });
  });

  it.each([
    ['thaw', thaw],
    [
      'test',
      {
        kind: 'test',
        title: 'Пробно известие',
        body: 'Работи',
        tag: 'test',
        url: '/settings',
        userId: DANI,
      },
    ],
  ] as const)(
    'shows a %s notification even while the app is visible and focused',
    async (_, payload) => {
      const { worker, shown } = fakeWorker({ windows: [fakeWindow()] });

      await onPush(worker, message(payload));

      expect(shown.map(({ title }) => title)).toEqual([payload.title]);
    },
  );
});

function notification(data: unknown) {
  const shown = {
    data,
    closed: false,
    close: () => {
      shown.closed = true;
    },
  };
  return shown;
}

describe('onNotificationClick on the body', () => {
  it("focuses the open app and takes it to the notification's screen", async () => {
    const win = fakeWindow({ visibilityState: 'hidden', focused: false });
    const { worker, opened, requests } = fakeWorker({ windows: [win] });
    const tapped = notification(thaw);

    await onNotificationClick(worker, tapped, '');

    expect(win.focusedTimes).toBe(1);
    expect(win.navigatedTo).toEqual(['https://family.test/menu']);
    expect(opened).toEqual([]);
    expect(requests).toEqual([]);
    expect(tapped.closed).toBe(true);
  });

  it("opens the app on the notification's screen when no window is open", async () => {
    const { worker, opened } = fakeWorker();
    const tapped = notification(thaw);

    await onNotificationClick(worker, tapped, '');

    expect(opened).toEqual(['https://family.test/menu']);
    expect(tapped.closed).toBe(true);
  });

  it('opens the screen in a new window when the open one cannot be navigated (not yet under the service worker)', async () => {
    const win = fakeWindow();
    win.navigate = () => Promise.reject(new TypeError('not controlled'));
    const { worker, opened } = fakeWorker({ windows: [win] });

    await onNotificationClick(worker, notification(thaw), '');

    expect(opened).toEqual(['https://family.test/menu']);
  });
});

describe('onNotificationClick on a button', () => {
  it('answers through the api as the person the notification is for, without opening the app', async () => {
    const { worker, opened, requests } = fakeWorker();
    const tapped = notification(thaw);

    await onNotificationClick(worker, tapped, 'thawed');

    expect(requests).toEqual([
      {
        url: 'https://family.test/api/reminders/thaw/meal-1',
        init: expect.objectContaining({
          method: 'POST',
          headers: { 'x-acting-user': DANI },
        }),
      },
    ]);
    expect(tapped.closed).toBe(true);
    expect(opened).toEqual([]);
  });

  it.each([
    ['the api refuses', () => new Response(null, { status: 409 })],
    ['the Cloudflare Access session expired', () => Response.error()],
    [
      'the network is down',
      () => Promise.reject(new TypeError('Failed to fetch')),
    ],
  ])("opens the notification's screen when %s", async (_, failure) => {
    const { worker, opened } = fakeWorker({ answer: failure });

    await onNotificationClick(worker, notification(thaw), 'thawed');

    expect(opened).toEqual(['https://family.test/menu']);
  });
});
