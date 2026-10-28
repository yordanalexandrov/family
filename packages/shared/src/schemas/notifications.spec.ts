import { describe, expect, it } from 'vitest';
import {
  notificationSettingsSchema,
  pushPayloadSchema,
  pushSubscriptionInputSchema,
} from './notifications.js';

/** What `PushSubscription.toJSON()` gives in Chrome on Android. */
const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc:def',
  expirationTime: null,
  keys: {
    p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA',
    auth: 'tBHItJI5svbpez7KI4CCXg',
  },
};

describe('pushSubscriptionInputSchema', () => {
  it('accepts PushSubscription.toJSON() and keeps the endpoint and the keys', () => {
    expect(pushSubscriptionInputSchema.parse(subscription)).toEqual({
      endpoint: subscription.endpoint,
      keys: subscription.keys,
    });
  });

  it('rejects an endpoint that is not https', () => {
    const result = pushSubscriptionInputSchema.safeParse({
      ...subscription,
      endpoint: 'http://push.example.com/abc',
    });

    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual([
      'endpoint',
    ]);
  });

  it('rejects a subscription without its auth key', () => {
    const result = pushSubscriptionInputSchema.safeParse({
      ...subscription,
      keys: { p256dh: subscription.keys.p256dh },
    });

    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual([
      'keys.auth',
    ]);
  });
});

describe('notificationSettingsSchema', () => {
  it('names every kind', () => {
    const settings = { thaw: true, cook: false, menu: true };
    expect(notificationSettingsSchema.parse(settings)).toEqual(settings);
  });

  it('rejects settings missing a kind or naming an unknown one', () => {
    expect(
      notificationSettingsSchema.safeParse({ thaw: true, cook: true }).success,
    ).toBe(false);
    expect(
      notificationSettingsSchema.safeParse({
        thaw: true,
        cook: true,
        menu: true,
        lunch: true,
      }).success,
    ).toBe(false);
  });
});

describe('pushPayloadSchema', () => {
  const thaw = {
    kind: 'thaw',
    title: 'Извади месото',
    body: 'Утре: мусака — кайма във фризера',
    tag: 'thaw:2026-10-28',
    url: '/menu',
    userId: '11111111-1111-4111-8111-111111111111',
    actions: [
      { action: 'thawed', title: 'Извадих', post: '/api/meals/abc/thawed' },
    ],
  };

  it('accepts a reminder with a button that posts to the api', () => {
    expect(pushPayloadSchema.parse(thaw)).toEqual(thaw);
  });

  it('accepts the test notification, without buttons', () => {
    const test = {
      kind: 'test',
      title: 'Пробно известие',
      body: 'Известията работят.',
      tag: 'test',
      url: '/settings',
      userId: thaw.userId,
    };
    expect(pushPayloadSchema.parse(test)).toEqual(test);
  });

  it('rejects a button whose post is not an api path, and a url off the app', () => {
    const result = pushPayloadSchema.safeParse({
      ...thaw,
      url: 'https://example.com/menu',
      actions: [{ action: 'thawed', title: 'Извадих', post: '/menu' }],
    });

    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual([
      'url',
      'actions.0.post',
    ]);
  });
});
