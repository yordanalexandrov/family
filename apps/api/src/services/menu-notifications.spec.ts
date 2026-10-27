import type { User } from '@family/shared';
import proposeFixture from '@family/shared/fixtures/menu-propose.valid.json' with {
  type: 'json',
};
import type { FastifyInstance } from 'fastify';
import { HttpResponse, http } from 'msw';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { buildTestApp } from '../test/app.js';
import { seedFixtureRecipes } from '../test/menu.js';
import {
  CHAT_COMPLETIONS_URL,
  completion,
  openclaw,
} from '../test/openclaw.js';
import {
  createTestPushService,
  deviceSubscription,
  TEST_VAPID_PUBLIC_KEY,
  type TestPushService,
} from '../test/push.js';
import { DANI, POLI } from '../test/users.js';

/** Wednesday 28 October 2026, 10:00 in Sofia. */
const NOW = new Date('2026-10-28T08:00:00Z');
/** Next week, the one the cron proposes for at `NOW`, and the week of the recorded `menu.propose` fixture; none of its days is past. */
const WEEK = '2026-11-02';
const MINUTE_MS = 60_000;

let clock = NOW;
let app: FastifyInstance;
let push: TestPushService;

beforeAll(async () => {
  openclaw.listen({ onUnhandledFrame: 'error' });
  push = createTestPushService();
  app = buildTestApp({
    now: () => clock,
    push: { publicKey: TEST_VAPID_PUBLIC_KEY, sender: push.sender },
  });
  await app.ready();
});

afterEach(() => openclaw.resetHandlers());

afterAll(async () => {
  await app.close();
  openclaw.close();
});

beforeEach(async () => {
  clock = NOW;
  push.delivered.length = 0;
  await subscribe(DANI);
  await subscribe(POLI);
});

function later(minutes: number) {
  clock = new Date(clock.getTime() + minutes * MINUTE_MS);
}

function as(user: User) {
  return { 'x-acting-user': user.id };
}

async function subscribe(user: User) {
  const response = await app.inject({
    method: 'PUT',
    url: '/api/notifications/subscription',
    headers: as(user),
    payload: deviceSubscription(user.name),
  });
  expect(response.statusCode).toBe(204);
}

/** An empty plan for `WEEK`; answers the ids of its meals, Monday first. */
async function emptyPlan(): Promise<string[]> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/menu/plans',
    headers: as(DANI),
    payload: { weekStart: WEEK },
  });
  expect(response.statusCode).toBe(201);
  return response.json().plan.meals.map((meal: { id: string }) => meal.id);
}

async function vote(user: User, mealId: string) {
  const response = await app.inject({
    method: 'PUT',
    url: `/api/menu/meals/${mealId}/vote`,
    headers: as(user),
    payload: { value: 'up' },
  });
  expect(response.statusCode).toBe(200);
}

async function comment(user: User, mealId: string) {
  const response = await app.inject({
    method: 'POST',
    url: `/api/menu/meals/${mealId}/comments`,
    headers: as(user),
    payload: { body: 'Може ли нещо по-леко?' },
  });
  expect(response.statusCode).toBe(201);
}

/** Changes the meal (a new note), as „Предложи друго“ and a pick by hand do. */
async function change(user: User, mealId: string, note = 'Пица') {
  const response = await app.inject({
    method: 'PATCH',
    url: `/api/menu/meals/${mealId}`,
    headers: as(user),
    payload: { note },
  });
  expect(response.statusCode).toBe(200);
}

/** The cron's `reminders` job, as `plugins/scheduler.ts` runs it every 5 minutes. */
async function runReminders() {
  await app.reminders.run();
}

/** What each device got: the endpoint's owner and the notification. */
function received() {
  return push.delivered.map(({ endpoint, payload }) => ({
    to: endpoint.split('/').at(-1),
    payload,
  }));
}

describe('menu activity (GLOSSARY: Известие от Съгласуването)', () => {
  it('gathers the other’s actions into one notification, 10 minutes after the last one', async () => {
    const [monday = '', tuesday = '', wednesday = ''] = await emptyPlan();
    await vote(POLI, monday);
    await vote(POLI, tuesday);
    later(1);
    await comment(POLI, tuesday);
    later(1);
    await change(POLI, wednesday);

    later(9);
    await runReminders();
    expect(received()).toEqual([]);

    later(1);
    await runReminders();
    expect(received()).toEqual([
      {
        to: DANI.name,
        payload: {
          kind: 'menu',
          userId: DANI.id,
          title: 'Поли по менюто',
          body: '2 гласа, 1 коментар, 1 смяна',
          tag: `menu-${WEEK}`,
          url: `/menu?week=${WEEK}`,
        },
      },
    ]);

    later(5);
    await runReminders();
    expect(received()).toHaveLength(1);
  });

  it('waits again when the other acts before the 10 minutes are over', async () => {
    const [monday = ''] = await emptyPlan();
    await vote(POLI, monday);
    later(8);
    await comment(POLI, monday);

    later(5);
    await runReminders();
    expect(received()).toEqual([]);

    later(5);
    await runReminders();
    expect(received()).toEqual([
      expect.objectContaining({
        to: DANI.name,
        payload: expect.objectContaining({ body: '1 глас, 1 коментар' }),
      }),
    ]);
  });

  it('never tells the one who acted, only the other', async () => {
    const [monday = '', tuesday = ''] = await emptyPlan();
    await vote(DANI, monday);
    await comment(DANI, monday);
    await change(DANI, monday);
    await change(DANI, tuesday, 'Супа');

    later(10);
    await runReminders();

    expect(received()).toEqual([
      {
        to: POLI.name,
        payload: expect.objectContaining({
          userId: POLI.id,
          title: 'Дани по менюто',
          body: '1 глас, 1 коментар, 2 смени',
        }),
      },
    ]);
  });

  it('counts a swap of two days as one change', async () => {
    const [monday = '', tuesday = ''] = await emptyPlan();
    const response = await app.inject({
      method: 'POST',
      url: `/api/menu/meals/${monday}/swap`,
      headers: as(POLI),
      payload: { withMealId: tuesday },
    });
    expect(response.statusCode).toBe(200);

    later(10);
    await runReminders();

    expect(received()).toEqual([
      expect.objectContaining({
        to: DANI.name,
        payload: expect.objectContaining({ body: '1 смяна' }),
      }),
    ]);
  });

  it('does not count a vote taken back, nor a new cook', async () => {
    const [monday = ''] = await emptyPlan();
    for (const request of [
      { method: 'DELETE' as const, url: `/api/menu/meals/${monday}/vote` },
      {
        method: 'PATCH' as const,
        url: `/api/menu/meals/${monday}`,
        payload: { cookUserId: POLI.id },
      },
    ]) {
      const response = await app.inject({ ...request, headers: as(POLI) });
      expect(response.statusCode).toBe(200);
    }

    later(10);
    await runReminders();

    expect(received()).toEqual([]);
  });

  it('sends nothing to someone who turned menu notifications off, and forgets the actions', async () => {
    const off = await app.inject({
      method: 'PUT',
      url: '/api/notifications/settings',
      headers: as(DANI),
      payload: { settings: { thaw: true, cook: true, menu: false } },
    });
    expect(off.statusCode).toBe(200);
    const [monday = ''] = await emptyPlan();
    await vote(POLI, monday);

    later(10);
    await runReminders();
    expect(received()).toEqual([]);

    await app.inject({
      method: 'PUT',
      url: '/api/notifications/settings',
      headers: as(DANI),
      payload: { settings: { thaw: true, cook: true, menu: true } },
    });
    later(10);
    await runReminders();
    expect(received()).toEqual([]);
  });
});

describe('new menu proposal', () => {
  beforeEach(async () => {
    await seedFixtureRecipes();
    proposeAnswers(JSON.stringify(proposeFixture));
  });

  function proposeAnswers(content: string) {
    openclaw.use(
      http.post(CHAT_COMPLETIONS_URL, () =>
        HttpResponse.json(completion(content)),
      ),
    );
  }

  const PROPOSED = {
    kind: 'menu',
    title: 'Ново предложение за меню',
    body: 'За 2–8 ноември',
    tag: `menu-${WEEK}`,
    url: `/menu?week=${WEEK}`,
  };

  it('tells everyone of the cron’s proposal once its plan is made', async () => {
    const { menuSchedule } = app;
    if (!menuSchedule) {
      throw new Error('the test app has no menu schedule');
    }

    await menuSchedule.run();

    await vi.waitFor(() => expect(received()).toHaveLength(2));
    expect(received()).toEqual(
      expect.arrayContaining([
        { to: DANI.name, payload: { ...PROPOSED, userId: DANI.id } },
        { to: POLI.name, payload: { ...PROPOSED, userId: POLI.id } },
      ]),
    );
  });

  it('tells only the other of a proposal someone asked for', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/menu/proposals',
      headers: as(DANI),
      payload: { weekStart: WEEK },
    });
    expect(response.statusCode).toBe(202);

    await vi.waitFor(() => expect(received()).toHaveLength(1));
    expect(received()).toEqual([
      { to: POLI.name, payload: { ...PROPOSED, userId: POLI.id } },
    ]);
  });

  it('tells nobody of a proposal that failed', async () => {
    proposeAnswers('not json');
    const response = await app.inject({
      method: 'POST',
      url: '/api/menu/proposals',
      headers: as(DANI),
      payload: { weekStart: WEEK },
    });
    const { proposal } = response.json();

    await vi.waitFor(async () => {
      const read = await app.inject({
        method: 'GET',
        url: `/api/menu/proposals/${proposal.id}`,
        headers: as(DANI),
      });
      expect(read.json().proposal.status).toBe('failed');
    });
    expect(received()).toEqual([]);
  });
});
