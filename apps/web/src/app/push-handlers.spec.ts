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

/**
 * Service worker-ът, както го вижда `push-handlers`: какво е показал, отворил, поискал от api-то и сложил върху иконата.
 * `/api/inbox/*` отговаря като api-то (прочитане 204, бройка `unread`); всичко друго — `answer`. Без `badging` няма
 * Badging API.
 */
function fakeWorker({
  windows = [],
  answer = () => new Response(null, { status: 204 }),
  unread = 0,
  badging = true,
}: {
  windows?: FakeWindow[];
  answer?: () => Response | Promise<Response>;
  unread?: number;
  badging?: boolean;
} = {}) {
  const shown: { title: string; options: NotificationShowOptions }[] = [];
  const opened: string[] = [];
  const requests: { url: string; init: RequestInit }[] = [];
  /** Бройките върху иконата; `0` е `clearAppBadge()`. */
  const badges: number[] = [];
  const worker: PushWorker = {
    badge: badging
      ? {
          setAppBadge: async (count) => {
            badges.push(count);
          },
          clearAppBadge: async () => {
            badges.push(0);
          },
        }
      : {},
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
      if (url === `${ORIGIN}/api/inbox/unread-count`) {
        return Response.json({ unread });
      }
      if (url.startsWith(`${ORIGIN}/api/inbox/`)) {
        return new Response(null, { status: 204 });
      }
      return answer();
    },
  };
  return { worker, shown, opened, requests, badges };
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

describe('onNotificationClick on „Аз“ (Кой готви довечера)', () => {
  const POLI = '22222222-2222-4222-8222-222222222222';
  const cook: PushPayload = {
    kind: 'cook',
    title: 'Кой готви довечера?',
    body: 'Мусака',
    tag: 'cook-meal-1',
    url: '/menu?week=2026-11-02',
    userId: DANI,
    actions: [
      {
        action: 'cook-claim',
        title: 'Аз',
        post: '/api/menu/meals/meal-1/cook-claim',
      },
    ],
  };

  it('confirms with a silent notification under the same tag', async () => {
    const { worker, shown, opened } = fakeWorker();

    await onNotificationClick(worker, notification(cook), 'cook-claim');

    expect(shown).toEqual([
      {
        title: 'Записано: готвиш ти',
        options: expect.objectContaining({
          body: 'Мусака',
          tag: 'cook-meal-1',
          silent: true,
          actions: [],
        }),
      },
    ]);
    expect(opened).toEqual([]);
  });

  it('says who cooks when someone answered first, without opening the app', async () => {
    const { worker, shown, opened } = fakeWorker({
      answer: () =>
        Response.json(
          {
            error: 'conflict',
            code: 'cook_taken',
            message: 'Някой вече готви',
            cookUserId: POLI,
            cookName: 'Поли',
          },
          { status: 409 },
        ),
    });

    await onNotificationClick(worker, notification(cook), 'cook-claim');

    expect(shown.map(({ title, options }) => [title, options.tag])).toEqual([
      ['Поли вече готви', 'cook-meal-1'],
    ]);
    expect(opened).toEqual([]);
  });

  it.each([
    ['the api fails', () => new Response(null, { status: 500 })],
    ['the Cloudflare Access session expired', () => Response.error()],
    [
      'the network is down',
      () => Promise.reject(new TypeError('Failed to fetch')),
    ],
  ])(
    'asks to open the menu when %s, and a tap on that opens the meal’s day',
    async (_, failure) => {
      const { worker, shown, opened } = fakeWorker({ answer: failure });

      await onNotificationClick(worker, notification(cook), 'cook-claim');

      expect(opened).toEqual([]);
      expect(shown.map(({ title }) => title)).toEqual([
        'Не успях да запиша. Отвори менюто',
      ]);
      const [failed] = shown;
      expect(failed?.options.actions).toEqual([]);

      await onNotificationClick(worker, notification(failed?.options.data), '');

      expect(opened).toEqual(['https://family.test/menu?week=2026-11-02']);
    },
  );
});

describe('the inbox (Входяща кутия) and the icon badge', () => {
  const INBOX_ID = 'eeeeeeee-0000-4000-8000-000000000001';
  const inThaw: PushPayload = { ...thaw, inboxId: INBOX_ID, unread: 2 };
  const asDani = { 'x-acting-user': DANI };

  it('puts the unread count of the push on the icon', async () => {
    const { worker, badges } = fakeWorker();

    await onPush(worker, message(inThaw));

    expect(badges).toEqual([2]);
  });

  it('puts the count on the icon even for a menu notification it does not show', async () => {
    const { worker, shown, badges } = fakeWorker({ windows: [fakeWindow()] });

    await onPush(worker, message({ ...inThaw, kind: 'menu', actions: [] }));

    expect(shown).toEqual([]);
    expect(badges).toEqual([2]);
  });

  it('shows the push as before without the Badging API', async () => {
    const { worker, shown } = fakeWorker({ badging: false });

    await onPush(worker, message(inThaw));

    expect(shown.map(({ title }) => title)).toEqual([thaw.title]);
  });

  it('reads the notification as its person on a tap of the body, opens it and puts the new count on the icon', async () => {
    const { worker, opened, requests, badges } = fakeWorker({ unread: 1 });

    await onNotificationClick(worker, notification(inThaw), '');

    expect(opened).toEqual(['https://family.test/menu']);
    expect(requests).toEqual([
      {
        url: `https://family.test/api/inbox/${INBOX_ID}/read`,
        init: expect.objectContaining({ method: 'POST', headers: asDani }),
      },
      {
        url: 'https://family.test/api/inbox/unread-count',
        init: expect.objectContaining({ headers: asDani }),
      },
    ]);
    expect(badges).toEqual([1]);
  });

  it('reads the notification on a button too, and clears the icon when nothing is left unread', async () => {
    const { worker, requests, badges } = fakeWorker({ unread: 0 });

    await onNotificationClick(worker, notification(inThaw), 'thawed');

    expect(requests.map(({ url }) => url)).toEqual(
      expect.arrayContaining([
        'https://family.test/api/reminders/thaw/meal-1',
        `https://family.test/api/inbox/${INBOX_ID}/read`,
      ]),
    );
    expect(badges).toEqual([0]);
  });

  it('reads it without the Badging API', async () => {
    const { worker, requests } = fakeWorker({ badging: false });

    await onNotificationClick(worker, notification(inThaw), '');

    expect(requests.map(({ url }) => url)).toEqual([
      `https://family.test/api/inbox/${INBOX_ID}/read`,
    ]);
  });
});
