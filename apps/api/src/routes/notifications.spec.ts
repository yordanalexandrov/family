import {
  type NotificationSettings,
  notificationSettingsBodySchema,
  pushDisabledSchema,
  pushTestResponseSchema,
  type User,
  vapidKeyResponseSchema,
} from '@family/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pushSubscription } from '../db/schema/notifications.js';
import type { PushMessage } from '../services/push.js';
import { buildTestApp } from '../test/app.js';
import {
  createTestPushService,
  deviceSubscription,
  TEST_VAPID_PUBLIC_KEY,
  type TestPushService,
} from '../test/push.js';
import { DANI, POLI } from '../test/users.js';

let app: FastifyInstance;
let push: TestPushService;

beforeAll(async () => {
  push = createTestPushService();
  app = buildTestApp({
    push: { publicKey: TEST_VAPID_PUBLIC_KEY, sender: push.sender },
  });
  await app.ready();
});

afterAll(() => app.close());

beforeEach(() => {
  push.delivered.length = 0;
});

async function subscribe(
  user: User,
  subscription: ReturnType<typeof deviceSubscription>,
) {
  const response = await app.inject({
    method: 'PUT',
    url: '/api/notifications/subscription',
    headers: { 'x-acting-user': user.id },
    payload: subscription,
  });
  expect(response.statusCode).toBe(204);
}

/** „Пробно известие“ from `user`; answers the endpoints it reached. */
async function testNotification(user: User): Promise<string[]> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/notifications/test',
    headers: { 'x-acting-user': user.id },
  });
  expect(response.statusCode).toBe(200);
  const { sent } = pushTestResponseSchema.parse(response.json());
  const endpoints = push.delivered.map((message) => message.endpoint);
  expect(sent).toBe(endpoints.length);
  push.delivered.length = 0;
  return endpoints.sort();
}

describe('PUT /api/notifications/subscription and POST /api/notifications/test', () => {
  it('reaches every device of the person, and only theirs', async () => {
    const phone = deviceSubscription('dani-phone');
    const tablet = deviceSubscription('dani-tablet');
    await subscribe(DANI, phone);
    await subscribe(DANI, tablet);
    await subscribe(POLI, deviceSubscription('poli-phone'));

    await app.inject({
      method: 'POST',
      url: '/api/notifications/test',
      headers: { 'x-acting-user': DANI.id },
    });

    expect(push.delivered).toEqual(
      [phone, tablet].map(({ endpoint }) => ({
        endpoint,
        payload: {
          kind: 'test',
          title: 'Пробно известие',
          body: expect.any(String),
          tag: 'test',
          url: '/settings',
          userId: DANI.id,
        },
      })),
    );
  });

  it('moves a device to whoever subscribes it next', async () => {
    const phone = deviceSubscription('shared-phone');
    await subscribe(DANI, phone);
    await subscribe(POLI, phone);

    expect(await testNotification(DANI)).toEqual([]);
    expect(await testNotification(POLI)).toEqual([phone.endpoint]);
  });

  it('refuses a subscription that is not one', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/notifications/subscription',
      headers: { 'x-acting-user': DANI.id },
      payload: { endpoint: 'not a url', keys: {} },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('DELETE /api/notifications/subscription', () => {
  it('turns a device off for its person, but not a device of someone else', async () => {
    const phone = deviceSubscription('dani-phone');
    await subscribe(DANI, phone);
    await subscribe(POLI, deviceSubscription('poli-phone'));

    for (const [user, endpoint] of [
      [DANI, phone.endpoint],
      [DANI, deviceSubscription('poli-phone').endpoint],
    ] as const) {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/notifications/subscription',
        headers: { 'x-acting-user': user.id },
        payload: { endpoint },
      });
      expect(response.statusCode).toBe(204);
    }

    expect(await testNotification(DANI)).toEqual([]);
    expect(await testNotification(POLI)).toHaveLength(1);
  });
});

async function settingsOf(user: User): Promise<NotificationSettings> {
  const response = await app.inject({
    method: 'GET',
    url: '/api/notifications/settings',
    headers: { 'x-acting-user': user.id },
  });
  expect(response.statusCode).toBe(200);
  return notificationSettingsBodySchema.parse(response.json()).settings;
}

async function saveSettings(user: User, settings: NotificationSettings) {
  const response = await app.inject({
    method: 'PUT',
    url: '/api/notifications/settings',
    headers: { 'x-acting-user': user.id },
    payload: { settings },
  });
  expect(response.statusCode).toBe(200);
  return notificationSettingsBodySchema.parse(response.json()).settings;
}

describe('GET and PUT /api/notifications/settings', () => {
  it('has every kind on until the person turns one off, for them only', async () => {
    expect(await settingsOf(DANI)).toEqual({
      thaw: true,
      cook: true,
      menu: true,
    });

    const off = { thaw: true, cook: false, menu: true };
    expect(await saveSettings(DANI, off)).toEqual(off);
    expect(await saveSettings(DANI, { ...off, menu: false })).toEqual({
      ...off,
      menu: false,
    });

    expect(await settingsOf(DANI)).toEqual({ ...off, menu: false });
    expect(await settingsOf(POLI)).toEqual({
      thaw: true,
      cook: true,
      menu: true,
    });
  });

  it('refuses settings that leave out a kind', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/notifications/settings',
      headers: { 'x-acting-user': DANI.id },
      payload: { settings: { thaw: false } },
    });

    expect(response.statusCode).toBe(400);
  });
});

const cookMessage: PushMessage = {
  title: 'Кой готви довечера?',
  body: 'Мусака',
  tag: 'cook:2026-10-28',
  url: '/menu',
  actions: [{ action: 'me', title: 'Аз', post: '/api/meals/m1/cook' }],
};

describe('app.push.send', () => {
  it('sends to every device of the person, with its kind and the person', async () => {
    const phone = deviceSubscription('dani-phone');
    await subscribe(DANI, phone);

    expect(await app.push.send(DANI.id, 'cook', cookMessage)).toBe(1);

    expect(push.delivered).toEqual([
      {
        endpoint: phone.endpoint,
        payload: { ...cookMessage, kind: 'cook', userId: DANI.id },
      },
    ]);
    const [row] = await app.db
      .select({ lastSuccessAt: pushSubscription.lastSuccessAt })
      .from(pushSubscription)
      .where(eq(pushSubscription.endpoint, phone.endpoint));
    expect(row?.lastSuccessAt).toBeInstanceOf(Date);
  });

  it('sends nothing of a kind the person turned off, though the test notification still goes', async () => {
    await subscribe(DANI, deviceSubscription('dani-phone'));
    await saveSettings(DANI, { thaw: true, cook: false, menu: true });

    expect(await app.push.send(DANI.id, 'cook', cookMessage)).toBe(0);
    expect(push.delivered).toEqual([]);

    expect(await app.push.send(DANI.id, 'thaw', cookMessage)).toBe(1);
    push.delivered.length = 0;
    expect(await testNotification(DANI)).toHaveLength(1);
  });

  it('deletes a device the push service says is gone (404, 410) and keeps one that failed otherwise', async () => {
    const gone = deviceSubscription('gone');
    const notFound = deviceSubscription('not-found');
    const busy = deviceSubscription('busy');
    const fine = deviceSubscription('fine');
    for (const device of [gone, notFound, busy, fine]) {
      await subscribe(DANI, device);
    }
    push.reject(gone.endpoint, 410);
    push.reject(notFound.endpoint, 404);
    push.reject(busy.endpoint, 503);

    expect(await app.push.send(DANI.id, 'menu', cookMessage)).toBe(1);

    const left = await app.db
      .select({ endpoint: pushSubscription.endpoint })
      .from(pushSubscription)
      .where(eq(pushSubscription.userId, DANI.id));
    expect(left.map((row) => row.endpoint).sort()).toEqual(
      [busy.endpoint, fine.endpoint].sort(),
    );
  });
});

describe('GET /api/notifications/vapid-key', () => {
  it('answers the public key to subscribe with', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/notifications/vapid-key',
      headers: { 'x-acting-user': DANI.id },
    });

    expect(response.statusCode).toBe(200);
    expect(vapidKeyResponseSchema.parse(response.json())).toEqual({
      publicKey: TEST_VAPID_PUBLIC_KEY,
    });
  });
});

describe('without VAPID keys', () => {
  let off: FastifyInstance;

  beforeAll(async () => {
    off = buildTestApp();
    await off.ready();
  });

  afterAll(() => off.close());

  it('sends nothing, quietly', async () => {
    const response = await off.inject({
      method: 'PUT',
      url: '/api/notifications/subscription',
      headers: { 'x-acting-user': DANI.id },
      payload: deviceSubscription('dani-phone'),
    });
    expect(response.statusCode).toBe(204);

    await expect(off.push.send(DANI.id, 'cook', cookMessage)).resolves.toBe(0);
    expect(push.delivered).toEqual([]);
  });

  it('answers 404 push_disabled for the test notification', async () => {
    const response = await off.inject({
      method: 'POST',
      url: '/api/notifications/test',
      headers: { 'x-acting-user': DANI.id },
    });

    expect(response.statusCode).toBe(404);
    expect(pushDisabledSchema.parse(response.json()).code).toBe(
      'push_disabled',
    );
  });

  it('answers 404 push_disabled for the key', async () => {
    const response = await off.inject({
      method: 'GET',
      url: '/api/notifications/vapid-key',
      headers: { 'x-acting-user': DANI.id },
    });

    expect(response.statusCode).toBe(404);
    expect(pushDisabledSchema.parse(response.json()).code).toBe(
      'push_disabled',
    );
  });
});
