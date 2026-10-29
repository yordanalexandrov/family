import type { NotificationSettings } from '@family/shared';
import { HttpResponse, http } from 'msw';
import { onTestFinished, vi } from 'vitest';
import { apiError, server } from './msw';

/** Публичният VAPID ключ на тестовото api (`GET /api/notifications/vapid-key`). */
export const TEST_VAPID_KEY = 'BTestVapidPublicKey';

export const TEST_ENDPOINT = 'https://push.example.test/send/phone-1';

interface PushBrowserOptions {
  /** `Notification.permission` при отваряне. */
  permission?: NotificationPermission;
  /** Какво отговаря човекът на `Notification.requestPermission()`. */
  answer?: NotificationPermission;
  /** Устройството вече е абонирано. */
  subscribed?: boolean;
  /** `pushManager.subscribe()` виси до `finishSubscribe()`, за да се види „Включване…“ (FCM отнема до 26 s). */
  slowSubscribe?: boolean;
  /** Няма активен service worker (dev, неуспешна регистрация): `navigator.serviceWorker.ready` не се изпълнява никога. */
  noActiveWorker?: boolean;
}

/**
 * Браузър с Web Push: `Notification`, `PushManager` и `navigator.serviceWorker.ready` с `pushManager`, който помни
 * абонамента. jsdom няма нито едно от тях, затова без този stub разделът „Известия“ е „неподдържано“.
 */
export function stubPushBrowser({
  permission = 'default',
  answer = 'granted',
  subscribed = false,
  slowSubscribe = false,
  noActiveWorker = false,
}: PushBrowserOptions = {}) {
  let current: PushSubscription | null = null;
  let finishSubscribe = () => {};
  const subscribeGate = slowSubscribe
    ? new Promise<void>((done) => {
        finishSubscribe = done;
      })
    : Promise.resolve();

  const makeSubscription = (): PushSubscription => {
    const subscription = {
      endpoint: TEST_ENDPOINT,
      toJSON: () => ({
        endpoint: TEST_ENDPOINT,
        expirationTime: null,
        keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
      }),
      unsubscribe: vi.fn(async () => {
        current = null;
        return true;
      }),
    };
    return subscription as unknown as PushSubscription;
  };
  if (subscribed) {
    current = makeSubscription();
  }

  const notification = {
    permission,
    requestPermission: vi.fn(async () => {
      notification.permission = answer;
      return answer;
    }),
  };
  const pushManager = {
    getSubscription: vi.fn(async () => current),
    subscribe: vi.fn(async (_options: PushSubscriptionOptionsInit) => {
      await subscribeGate;
      current = makeSubscription();
      return current;
    }),
  };

  vi.stubGlobal('Notification', notification);
  vi.stubGlobal('PushManager', class {});
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: noActiveWorker
        ? new Promise(() => {})
        : Promise.resolve({ pushManager }),
    },
  });
  onTestFinished(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  return {
    notification,
    pushManager,
    /** Текущият абонамент на устройството, ако има. */
    subscription: () => current,
    /** Пуска висящия `subscribe()` при `slowSubscribe`. */
    finishSubscribe: () => finishSubscribe(),
  };
}

interface PushApiOptions {
  /** api-то е без VAPID ключове: `vapid-key` и `test` връщат 404 `push_disabled`. */
  disabled?: boolean;
  settings?: NotificationSettings;
}

/** Заявка към `/api/notifications/*`, както я е видяло api-то. */
export interface PushRequest {
  method: string;
  path: string;
  actingUser: string | null;
  body: unknown;
}

/** msw за `/api/notifications/*`: пази настройките и записва всяка заявка. */
export function servePushApi({
  disabled = false,
  settings = { thaw: true, cook: true, menu: true },
}: PushApiOptions = {}) {
  const requests: PushRequest[] = [];
  const state = { settings: { ...settings } };
  const record = async (request: Request) => {
    const body: unknown = await request
      .clone()
      .json()
      .catch(() => undefined);
    requests.push({
      method: request.method,
      path: new URL(request.url).pathname,
      actingUser: request.headers.get('x-acting-user'),
      body,
    });
  };
  const pushDisabled = () =>
    HttpResponse.json(
      {
        error: 'not_found',
        code: 'push_disabled',
        message: 'Известията не са включени на сървъра',
      },
      { status: 404 },
    );

  server.use(
    http.get('/api/notifications/vapid-key', async ({ request }) => {
      await record(request);
      return disabled
        ? pushDisabled()
        : HttpResponse.json({ publicKey: TEST_VAPID_KEY });
    }),
    http.put('/api/notifications/subscription', async ({ request }) => {
      await record(request);
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete('/api/notifications/subscription', async ({ request }) => {
      await record(request);
      return new HttpResponse(null, { status: 204 });
    }),
    http.get('/api/notifications/settings', async ({ request }) => {
      await record(request);
      return HttpResponse.json({ settings: state.settings });
    }),
    http.put('/api/notifications/settings', async ({ request }) => {
      await record(request);
      const body = (await request.json()) as { settings: NotificationSettings };
      state.settings = body.settings;
      return HttpResponse.json({ settings: state.settings });
    }),
    http.post('/api/notifications/test', async ({ request }) => {
      await record(request);
      return disabled ? pushDisabled() : HttpResponse.json({ sent: 1 });
    }),
  );

  return {
    requests,
    state,
    /**
     * Следващият `PUT /api/notifications/settings` пада с 500, но едва след `fail()`; дотогава заявката виси, за да се
     * види оптимистичното състояние.
     */
    failNextSettingsSave() {
      let resolve = () => {};
      const promise = new Promise<void>((done) => {
        resolve = done;
      });
      server.use(
        http.put(
          '/api/notifications/settings',
          async () => {
            await promise;
            return apiError(500, 'error', 'Нещо се обърка');
          },
          { once: true },
        ),
      );
      return { fail: () => resolve() };
    },
  };
}
