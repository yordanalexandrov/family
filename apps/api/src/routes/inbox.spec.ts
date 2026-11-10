import {
  type InboxItem,
  inboxResponseSchema,
  inboxUnreadCountSchema,
  type User,
} from '@family/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PushMessage } from '../services/push.js';
import { buildTestApp } from '../test/app.js';
import {
  createTestPushService,
  deviceSubscription,
  TEST_VAPID_PUBLIC_KEY,
} from '../test/push.js';
import { DANI, POLI } from '../test/users.js';

/** Wednesday 4 November 2026, 20:00 in Sofia. */
const EVENING = new Date('2026-11-04T18:00:00Z');

let clock = EVENING;
let app: FastifyInstance;
let push = createTestPushService();

beforeAll(async () => {
  app = buildTestApp({
    now: () => clock,
    push: {
      publicKey: TEST_VAPID_PUBLIC_KEY,
      sender: (target, payload) => push.sender(target, payload),
    },
  });
  await app.ready();
});

afterAll(() => app.close());

beforeEach(() => {
  clock = EVENING;
  push = createTestPushService();
});

const THAW: PushMessage = {
  title: 'Извади месото за утре',
  body: 'Мусака: смесена кайма',
  tag: 'thaw-meal-1',
  url: '/menu?week=2026-11-02&meal=meal-1',
};

const MENU: PushMessage = {
  title: 'Поли по менюто',
  body: '2 гласа',
  tag: 'menu-2026-11-02',
  url: '/menu?week=2026-11-02',
};

function as(user: User) {
  return { 'x-acting-user': user.id };
}

async function inbox(user: User): Promise<InboxItem[]> {
  const response = await app.inject({
    method: 'GET',
    url: '/api/inbox',
    headers: as(user),
  });
  expect(response.statusCode).toBe(200);
  return inboxResponseSchema.parse(response.json()).items;
}

async function unread(user: User): Promise<number> {
  const response = await app.inject({
    method: 'GET',
    url: '/api/inbox/unread-count',
    headers: as(user),
  });
  expect(response.statusCode).toBe(200);
  return inboxUnreadCountSchema.parse(response.json()).unread;
}

function read(user: User, id: string) {
  return app.inject({
    method: 'POST',
    url: `/api/inbox/${id}/read`,
    headers: as(user),
  });
}

function readAll(user: User) {
  return app.inject({
    method: 'POST',
    url: '/api/inbox/read-all',
    headers: as(user),
  });
}

async function turnOff(user: User, kind: 'thaw' | 'cook' | 'menu') {
  const response = await app.inject({
    method: 'PUT',
    url: '/api/notifications/settings',
    headers: as(user),
    payload: {
      settings: { thaw: true, cook: true, menu: true, [kind]: false },
    },
  });
  expect(response.statusCode).toBe(200);
}

async function subscribe(user: User, device: string) {
  const response = await app.inject({
    method: 'PUT',
    url: '/api/notifications/subscription',
    headers: as(user),
    payload: deviceSubscription(device),
  });
  expect(response.statusCode).toBe(204);
}

describe('app.inbox.notify', () => {
  it('keeps the notification in the inbox, unread, and rings the person’s phone', async () => {
    await subscribe(DANI, 'dani-phone');

    await app.inbox.notify(DANI.id, 'thaw', THAW);

    expect(await inbox(DANI)).toEqual([
      {
        id: expect.any(String),
        kind: 'thaw',
        title: THAW.title,
        body: THAW.body,
        url: THAW.url,
        details: [],
        createdAt: EVENING.toISOString(),
        updatedAt: EVENING.toISOString(),
        unread: true,
      },
    ]);
    expect(push.delivered.map((d) => d.payload)).toMatchObject([
      { kind: 'thaw', title: THAW.title, userId: DANI.id },
    ]);
  });

  it('keeps it in the inbox with the kind turned off, without ringing', async () => {
    await subscribe(DANI, 'dani-phone');
    await turnOff(DANI, 'thaw');

    await app.inbox.notify(DANI.id, 'thaw', THAW);

    expect((await inbox(DANI)).map((item) => item.title)).toEqual([THAW.title]);
    expect(push.delivered).toEqual([]);
  });

  it('keeps it in the inbox of a person without a device', async () => {
    await app.inbox.notify(POLI.id, 'menu', MENU);

    expect((await inbox(POLI)).map((item) => item.title)).toEqual([MENU.title]);
    expect(await unread(POLI)).toBe(1);
  });

  it('updates the notification with the same tag, moves it to the top and makes it unread again', async () => {
    await app.inbox.notify(DANI.id, 'thaw', THAW);
    clock = new Date('2026-11-04T18:30:00Z');
    await app.inbox.notify(DANI.id, 'menu', MENU);
    const [, thaw] = await inbox(DANI);
    expect((await read(DANI, thaw?.id ?? '')).statusCode).toBe(204);

    clock = new Date('2026-11-05T06:00:00Z');
    await app.inbox.notify(DANI.id, 'thaw', {
      ...THAW,
      title: 'Извади месото за довечера',
      body: 'Мусака: смесена кайма, свински врат',
    });

    expect(await inbox(DANI)).toEqual([
      {
        id: thaw?.id,
        kind: 'thaw',
        title: 'Извади месото за довечера',
        body: 'Мусака: смесена кайма, свински врат',
        url: THAW.url,
        details: [],
        createdAt: EVENING.toISOString(),
        updatedAt: '2026-11-05T06:00:00.000Z',
        unread: true,
      },
      expect.objectContaining({ title: MENU.title }),
    ]);
  });

  it('keeps the details in the inbox only, and the same tag replaces them', async () => {
    await subscribe(DANI, 'dani-phone');
    await app.inbox.notify(DANI.id, 'thaw', {
      ...THAW,
      details: [
        { text: 'Във фризера: смесена кайма', url: '/pantry' },
        { text: 'Готви: Поли' },
      ],
    });

    expect((await inbox(DANI))[0]?.details).toEqual([
      { text: 'Във фризера: смесена кайма', url: '/pantry' },
      { text: 'Готви: Поли' },
    ]);
    expect(push.delivered[0]?.payload).not.toHaveProperty('details');

    await app.inbox.notify(DANI.id, 'thaw', {
      ...THAW,
      details: [{ text: 'Готви: Дани' }],
    });
    await app.inbox.notify(DANI.id, 'menu', MENU);

    expect(
      (await inbox(DANI)).map(({ kind, details }) => ({ kind, details })),
    ).toEqual([
      { kind: 'menu', details: [] },
      { kind: 'thaw', details: [{ text: 'Готви: Дани' }] },
    ]);
  });

  it('keeps the same tag apart for each person', async () => {
    await app.inbox.notify(DANI.id, 'menu', MENU);
    await app.inbox.notify(POLI.id, 'menu', MENU);
    expect(
      (await read(DANI, (await inbox(DANI))[0]?.id ?? '')).statusCode,
    ).toBe(204);

    expect(await unread(DANI)).toBe(0);
    expect(await unread(POLI)).toBe(1);
  });
});

describe('GET /api/inbox and /api/inbox/unread-count', () => {
  it('shows only the acting user’s notifications, the last updated first, and counts the unread', async () => {
    await app.inbox.notify(DANI.id, 'thaw', THAW);
    clock = new Date('2026-11-04T19:00:00Z');
    await app.inbox.notify(DANI.id, 'menu', MENU);
    await app.inbox.notify(POLI.id, 'cook', {
      title: 'Кой готви довечера?',
      body: 'Мусака',
      tag: 'cook-meal-1',
      url: '/menu?week=2026-11-02&meal=meal-1',
    });

    expect((await inbox(DANI)).map((item) => item.title)).toEqual([
      MENU.title,
      THAW.title,
    ]);
    expect(await unread(DANI)).toBe(2);
    expect((await inbox(POLI)).map((item) => item.title)).toEqual([
      'Кой готви довечера?',
    ]);
  });

  it('is empty for a person without notifications', async () => {
    expect(await inbox(POLI)).toEqual([]);
    expect(await unread(POLI)).toBe(0);
  });

  it('needs an acting user', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/inbox' });

    expect(response.statusCode).toBe(400);
  });
});

describe('POST /api/inbox/:id/read and /api/inbox/read-all', () => {
  it('reads one notification', async () => {
    await app.inbox.notify(DANI.id, 'thaw', THAW);
    clock = new Date('2026-11-04T18:10:00Z');
    await app.inbox.notify(DANI.id, 'menu', MENU);
    const [menu] = await inbox(DANI);

    const response = await read(DANI, menu?.id ?? '');

    expect(response.statusCode).toBe(204);
    expect(
      (await inbox(DANI)).map(({ title, unread }) => ({ title, unread })),
    ).toEqual([
      { title: MENU.title, unread: false },
      { title: THAW.title, unread: true },
    ]);
    expect(await unread(DANI)).toBe(1);
    // Again is the same.
    expect((await read(DANI, menu?.id ?? '')).statusCode).toBe(204);
  });

  it('reads all of the acting user’s notifications, and nobody else’s', async () => {
    await app.inbox.notify(DANI.id, 'thaw', THAW);
    await app.inbox.notify(DANI.id, 'menu', MENU);
    await app.inbox.notify(POLI.id, 'menu', MENU);

    expect((await readAll(DANI)).statusCode).toBe(204);

    expect(await unread(DANI)).toBe(0);
    expect(await unread(POLI)).toBe(1);
  });

  it('does not read someone else’s notification', async () => {
    await app.inbox.notify(DANI.id, 'thaw', THAW);
    const [thaw] = await inbox(DANI);

    const response = await read(POLI, thaw?.id ?? '');

    expect(response.statusCode).toBe(404);
    expect(await unread(DANI)).toBe(1);
  });

  it('answers 404 for a notification that does not exist, 400 for an id that is not one', async () => {
    expect(
      (await read(DANI, '6a1e8a52-3f43-4c7e-9a43-2b1f1d4a0c11')).statusCode,
    ).toBe(404);
    expect((await read(DANI, 'nope')).statusCode).toBe(400);
  });
});

describe('app.inbox.prune (the cron)', () => {
  it('deletes the notifications not updated for 30 days, read or not', async () => {
    clock = new Date('2026-10-05T17:59:00Z');
    await app.inbox.notify(DANI.id, 'thaw', THAW);
    await app.inbox.notify(POLI.id, 'thaw', THAW);
    await readAll(POLI);
    clock = new Date('2026-10-05T18:01:00Z');
    await app.inbox.notify(DANI.id, 'menu', MENU);

    clock = EVENING;
    await app.inbox.prune();

    expect((await inbox(DANI)).map((item) => item.title)).toEqual([MENU.title]);
    expect(await inbox(POLI)).toEqual([]);
  });
});
