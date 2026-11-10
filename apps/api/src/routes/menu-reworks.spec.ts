import type { ServerEvent } from '@family/shared';
import replaceFixture from '@family/shared/fixtures/meal-replace.valid.json' with {
  type: 'json',
};
import reworkInput from '@family/shared/fixtures/menu-rework.input.json' with {
  type: 'json',
};
import reworkFixture from '@family/shared/fixtures/menu-rework.valid.json' with {
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
import { stockPantry } from '../test/pantry.js';
import {
  createTestPushService,
  deviceSubscription,
  TEST_VAPID_PUBLIC_KEY,
  type TestPushService,
} from '../test/push.js';
import { DANI, POLI } from '../test/users.js';

/** Wednesday 28 October 2026, 10:00 in Sofia: the week of 2 November is planned before it begins. */
const BEFORE = new Date('2026-10-28T08:00:00Z');
/** Wednesday 4 November 2026, 10:00 in Sofia: Monday and Tuesday are past, today is still to come. */
const NOW = new Date('2026-11-04T08:00:00Z');
/** The week of the `menu.rework` fixture. */
const WEEK = '2026-11-02';

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

beforeEach(async () => {
  clock = NOW;
  await seedFixtureRecipes();
});

afterEach(() => openclaw.resetHandlers());

afterAll(async () => {
  await app.close();
  openclaw.close();
});

/** Id of recipe `n` of the fixture registry. */
function recipeId(n: number) {
  return `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function inject(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
  as = DANI.id,
) {
  return app.inject({
    method,
    url,
    headers: { 'x-acting-user': as },
    payload,
  });
}

/** Answers the chat completions in turn with `contents` (the last one from then on); returns the request bodies. */
function answerInTurn(...contents: string[]) {
  const bodies: {
    model: string;
    messages: { role: string; content: string }[];
    response_format: { json_schema: { name: string } };
  }[] = [];
  openclaw.use(
    http.post(CHAT_COMPLETIONS_URL, async ({ request }) => {
      bodies.push((await request.json()) as (typeof bodies)[number]);
      const content = contents[bodies.length - 1] ?? contents.at(-1) ?? '';
      return HttpResponse.json(completion(content));
    }),
  );
  return bodies;
}

/** Holds every answer until `release()`, then answers `content`. */
function answerLater(content: string) {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  openclaw.use(
    http.post(CHAT_COMPLETIONS_URL, async () => {
      await held;
      return HttpResponse.json(completion(content));
    }),
  );
  return () => release();
}

interface TestMeal {
  id: string;
  date: string;
  recipeId: string | null;
  note: string | null;
  why: string | null;
  cookUserId: string | null;
  servings: Record<string, number>;
  votes: { userId: string; value: string }[];
}

async function createPlan(weekStart: string): Promise<TestMeal[]> {
  const response = await inject('POST', '/api/menu/plans', { weekStart });
  expect(response.statusCode).toBe(201);
  return response.json().plan.meals;
}

async function patchMeal(id: string, payload: object, as = DANI.id) {
  const response = await inject('PATCH', `/api/menu/meals/${id}`, payload, as);
  expect(response.statusCode).toBe(200);
  return response.json().meal as TestMeal;
}

async function vote(id: string, value: 'up' | 'down' | null, as: string) {
  const response =
    value === null
      ? await inject('DELETE', `/api/menu/meals/${id}/vote`, undefined, as)
      : await inject('PUT', `/api/menu/meals/${id}/vote`, { value }, as);
  expect(response.statusCode).toBe(200);
}

async function comment(mealId: string, body: string, as: string) {
  const response = await inject(
    'POST',
    `/api/menu/meals/${mealId}/comments`,
    { body },
    as,
  );
  expect(response.statusCode).toBe(201);
}

async function thread(mealId: string) {
  const response = await inject('GET', `/api/menu/meals/${mealId}/comments`);
  expect(response.statusCode).toBe(200);
  return response.json().comments as {
    kind: string;
    authorUserId: string;
    body: string;
  }[];
}

async function plan(weekStart = WEEK) {
  const response = await inject(
    'GET',
    `/api/menu/plans?weekStart=${weekStart}`,
  );
  expect(response.statusCode).toBe(200);
  return response.json().plan as { summary: string | null; meals: TestMeal[] };
}

/**
 * The week the input fixture describes, as the family made it before it began: salmon and moussaka on the past Monday
 * and Tuesday; today's chicken talked over and vetoed by Поли; Thursday's mackerel kept by Дани's „за“; Friday's
 * stuffed peppers with a note and no vote; Saturday empty; Sunday only a note. Recipes 7 and 4 were served in the 2
 * weeks before. Returns the meals, Monday first; the clock is today.
 */
async function fixtureWeek(): Promise<TestMeal[]> {
  clock = new Date('2026-10-01T08:00:00Z');
  const twoWeeksBack = await createPlan('2026-10-19');
  await patchMeal(twoWeeksBack[2]?.id ?? '', { recipeId: recipeId(7) });
  const lastWeek = await createPlan('2026-10-26');
  await patchMeal(lastWeek[0]?.id ?? '', { recipeId: recipeId(4) });

  clock = BEFORE;
  const meals = await createPlan(WEEK);
  const [mon, tue, wed, thu, fri, , sun] = meals.map((meal) => meal.id) as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  await patchMeal(mon, { recipeId: recipeId(3) });
  await patchMeal(tue, { recipeId: recipeId(5) });
  await patchMeal(wed, { recipeId: recipeId(1) });
  await comment(wed, 'Пак пиле? Тази вечер по-добре нещо без месо.', POLI.id);
  await vote(wed, 'down', POLI.id);
  await patchMeal(thu, { recipeId: recipeId(8) });
  await patchMeal(fri, { recipeId: recipeId(6), note: 'без лук за Поли' });
  await vote(fri, null, DANI.id);
  await patchMeal(sun, { note: 'ядем навън' });
  clock = NOW;
  return meals;
}

async function rework(payload: object = { weekStart: WEEK }, as = DANI.id) {
  const response = await inject('POST', '/api/menu/reworks', payload, as);
  expect(response.statusCode).toBe(202);
  return response.json().rework;
}

/** Polls `GET /api/menu/reworks/:id` until the background run has finished. */
async function finished(id: string, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const response = await inject('GET', `/api/menu/reworks/${id}`);
    expect(response.statusCode).toBe(200);
    const { rework } = response.json();
    if (rework.status !== 'pending') {
      return rework;
    }
    if (Date.now() > deadline) {
      throw new Error(`rework ${id} still pending`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

const [WED_ANSWER, FRI_ANSWER, SAT_ANSWER] = reworkFixture.days;

describe('POST /api/menu/reworks', () => {
  it('answers 202 with a pending rework, then writes the agent’s recipes into the days to fill', async () => {
    answerInTurn(JSON.stringify(reworkFixture));
    await fixtureWeek();
    const before = (await plan()).meals;

    const pending = await rework({ weekStart: WEEK, hint: 'по-леко' });
    expect(pending).toMatchObject({
      weekStart: WEEK,
      status: 'pending',
      requestedBy: DANI.id,
      hint: 'по-леко',
    });
    const done = await finished(pending.id);

    expect(done).toMatchObject({ status: 'done', changed: 3 });
    expect(done.finishedAt).toEqual(expect.any(String));
    const after = await plan();
    expect(after.summary).toBe(reworkFixture.summary);
    expect(
      after.meals.map(({ recipeId, note, why, votes }) => ({
        recipeId,
        note,
        why,
        votes,
      })),
    ).toEqual([
      { ...pick(before[0]), why: null },
      { ...pick(before[1]), why: null },
      { recipeId: recipeId(7), note: null, why: WED_ANSWER?.why, votes: [] },
      { ...pick(before[3]), why: null },
      {
        recipeId: recipeId(10),
        note: 'без лук за Поли',
        why: FRI_ANSWER?.why,
        votes: [],
      },
      { recipeId: recipeId(2), note: null, why: SAT_ANSWER?.why, votes: [] },
      { ...pick(before[6]), why: null },
    ]);
  });

  it('writes a line of the AI in the thread of each changed day, and nothing in the others', async () => {
    answerInTurn(JSON.stringify(reworkFixture));
    const meals = await fixtureWeek();

    await finished((await rework()).id);

    const [, , wed, thu, fri, sat] = meals;
    expect((await thread(wed?.id ?? '')).at(-1)).toMatchObject({
      kind: 'system',
      authorUserId: DANI.id,
      body: 'AI смени „Пиле с ориз на фурна“ с „Омлет със спанак и сирене“ при преработката на менюто',
    });
    expect((await thread(fri?.id ?? '')).at(-1)?.body).toBe(
      'AI смени „Постни пълнени чушки“ с „Зеленчуков гювеч“ при преработката на менюто',
    );
    expect(await thread(sat?.id ?? '')).toEqual([
      expect.objectContaining({
        kind: 'system',
        body: 'AI сложи „Леща яхния“ при преработката на менюто',
      }),
    ]);
    expect((await thread(thu?.id ?? '')).at(-1)?.body).toBe(
      'избра „Скумрия на тиган с лимон“',
    );
  });

  it('sends family-menu-rework the week by days, the threads and notes of the days to fill, the free registry, the pantry and the hint', async () => {
    const bodies = answerInTurn(JSON.stringify(reworkFixture));
    await fixtureWeek();
    await stockPantry(app, [
      { name: 'ориз', kind: 'staple' },
      ...reworkInput.useUp.map((item) => ({
        ...item,
        kind: 'use_up' as const,
      })),
    ]);

    await finished(
      (await rework({ weekStart: WEEK, hint: reworkInput.hint })).id,
    );

    expect(bodies).toHaveLength(1);
    const [body] = bodies;
    expect(body?.model).toBe('openclaw/family-menu-rework');
    expect(body?.response_format.json_schema.name).toBe('menu_rework');
    const input = JSON.parse(body?.messages[0]?.content ?? '');
    const byId = (a: { id: string }, b: { id: string }) =>
      a.id.localeCompare(b.id);
    // Neither the kept mackerel (8) nor the vetoed chicken (1) is to choose from.
    expect({ ...input, recipes: input.recipes.sort(byId) }).toEqual({
      ...reworkInput,
      recipes: [...reworkInput.recipes].sort(byId),
    });
  });

  it('keeps the cook and the servings of a changed day, and takes it off the shopping list', async () => {
    answerInTurn(JSON.stringify(reworkFixture));
    const meals = await fixtureWeek();
    const fri = meals[4]?.id ?? '';
    const thu = meals[3]?.id ?? '';
    await patchMeal(fri, {
      cookUserId: POLI.id,
      servings: { [DANI.id]: 2, [POLI.id]: 0 },
    });
    for (const id of [fri, thu]) {
      const added = await inject(
        'PUT',
        `/api/shopping-lists/${WEEK}/meals/${id}`,
      );
      expect(added.statusCode).toBe(200);
    }

    await finished((await rework()).id);

    const friday = (await plan()).meals[4];
    expect(friday).toMatchObject({
      recipeId: recipeId(10),
      cookUserId: POLI.id,
      servings: { [DANI.id]: 2, [POLI.id]: 0 },
    });
    const list = await inject('GET', `/api/shopping-lists/${WEEK}`);
    expect(list.json().list.listedMealIds).toEqual([thu]);
  });

  it('drops the „Предложи друго“ candidates of a changed day', async () => {
    const meals = await fixtureWeek();
    const wed = meals[2]?.id ?? '';
    answerInTurn(JSON.stringify(replaceFixture));
    const asked = await inject('POST', `/api/menu/meals/${wed}/replacements`);
    expect(asked.statusCode).toBe(202);
    await waitForReplacement(asked.json().replacement.id);
    answerInTurn(JSON.stringify(reworkFixture));

    await finished((await rework()).id);

    const latest = await inject('GET', `/api/menu/meals/${wed}/replacements`);
    expect(latest.statusCode).toBe(404);
    expect(latest.json()).toMatchObject({ code: 'no_replacement' });
  });

  it('leaves a day that gets its own recipe back as it was', async () => {
    const answer = structuredClone(reworkFixture);
    answer.days[1] = {
      ...answer.days[1],
      recipeId: recipeId(6),
      why: 'Пак.',
    } as (typeof answer.days)[number];
    answerInTurn(JSON.stringify(answer));
    const meals = await fixtureWeek();
    const fri = meals[4]?.id ?? '';
    const lines = await thread(fri);

    const done = await finished((await rework()).id);

    expect(done.changed).toBe(2);
    expect((await plan()).meals[4]).toMatchObject({
      recipeId: recipeId(6),
      note: 'без лук за Поли',
      why: null,
    });
    expect(await thread(fri)).toEqual(lines);
  });

  it('signals the rework when it is asked for and when it ends, and the menu and the shopping list once it is written', async () => {
    answerInTurn(JSON.stringify(reworkFixture));
    await fixtureWeek();
    const signals: ServerEvent[] = [];
    const unsubscribe = app.events.subscribe((event) => signals.push(event));

    await finished((await rework()).id);
    unsubscribe();

    expect(signals).toEqual([
      { type: 'menu.rework.changed', weekStart: WEEK },
      { type: 'menu.rework.changed', weekStart: WEEK },
      { type: 'menu.changed', weekStart: WEEK },
      { type: 'shopping.changed', weekStart: WEEK },
    ]);
  });

  it('signals only the rework when it fails: the menu is as it was', async () => {
    answerInTurn('not json', 'not json');
    await fixtureWeek();
    const signals: ServerEvent[] = [];
    const unsubscribe = app.events.subscribe((event) => signals.push(event));

    expect(await finished((await rework()).id)).toMatchObject({
      status: 'failed',
    });
    unsubscribe();

    expect(signals).toEqual([
      { type: 'menu.rework.changed', weekStart: WEEK },
      { type: 'menu.rework.changed', weekStart: WEEK },
    ]);
  });

  it('answers 404 no_plan for a week without a menu', async () => {
    const response = await inject('POST', '/api/menu/reworks', {
      weekStart: WEEK,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'no_plan' });
  });

  it('answers 409 menu_reworking while a rework of the week is pending', async () => {
    const release = answerLater(JSON.stringify(reworkFixture));
    await fixtureWeek();
    const pending = await rework();

    const twice = await inject('POST', '/api/menu/reworks', {
      weekStart: WEEK,
    });

    expect(twice.statusCode).toBe(409);
    expect(twice.json()).toMatchObject({ code: 'menu_reworking' });
    release();
    await finished(pending.id);
  });

  it('answers 409 replacement_pending while „Предложи друго“ is pending for a meal of the week', async () => {
    const meals = await fixtureWeek();
    const release = answerLater(JSON.stringify(replaceFixture));
    const asked = await inject(
      'POST',
      `/api/menu/meals/${meals[4]?.id}/replacements`,
    );
    expect(asked.statusCode).toBe(202);

    const response = await inject('POST', '/api/menu/reworks', {
      weekStart: WEEK,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'replacement_pending' });
    release();
    await waitForReplacement(asked.json().replacement.id);
  });

  it('answers 409 not_enough_recipes when the free dinner recipes are fewer than the days to fill', async () => {
    await fixtureWeek();
    // Left to choose from: 3, 5 and 6; the kept 8 and the vetoed 1 are not. Three days to fill.
    for (const n of [2, 4, 7, 9, 10]) {
      await inject('POST', `/api/recipes/${recipeId(n)}/archive`);
    }
    await inject('POST', `/api/recipes/${recipeId(3)}/archive`);

    const response = await inject('POST', '/api/menu/reworks', {
      weekStart: WEEK,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'not_enough_recipes',
      have: 2,
      need: 3,
    });
  });

  it('answers 409 nothing_to_rework when every day from today on is kept', async () => {
    const meals = await fixtureWeek();
    await vote(meals[2]?.id ?? '', 'up', POLI.id);
    await vote(meals[4]?.id ?? '', 'up', POLI.id);
    await patchMeal(meals[5]?.id ?? '', { note: 'остатъци' });

    const response = await inject('POST', '/api/menu/reworks', {
      weekStart: WEEK,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'nothing_to_rework' });
  });

  it('fails as invalid_output when the retry is invalid too, leaves the menu as it was and takes a new rework', async () => {
    const meals = await fixtureWeek();
    const kept = structuredClone(reworkFixture);
    kept.days[0] = {
      ...kept.days[0],
      recipeId: recipeId(8),
    } as (typeof kept.days)[number];
    const bodies = answerInTurn(JSON.stringify(kept));
    const before = await plan();
    const lines = await thread(meals[2]?.id ?? '');

    const done = await finished((await rework()).id);

    expect(done).toMatchObject({ status: 'failed', error: 'invalid_output' });
    expect(done.changed).toBeUndefined();
    expect(bodies).toHaveLength(2);
    expect(await plan()).toEqual(before);
    expect(await thread(meals[2]?.id ?? '')).toEqual(lines);
    answerInTurn(JSON.stringify(reworkFixture));
    expect((await finished((await rework()).id)).status).toBe('done');
  });
});

describe('the week while a rework is pending', () => {
  /** The fixture week with a pending rework; `release()` lets the agent answer and waits for the rework to end. */
  async function reworkingWeek(answer: object = reworkFixture) {
    const meals = await fixtureWeek();
    const letGo = answerLater(JSON.stringify(answer));
    const pending = await rework();
    return {
      meals,
      release: async () => {
        letGo();
        return finished(pending.id);
      },
    };
  }

  function expectReworking(response: { statusCode: number; json(): unknown }) {
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: 'conflict',
      code: 'menu_reworking',
      message: 'AI преработва менюто: изчакай да свърши',
    });
  }

  it('answers 409 menu_reworking to every change of the content, the votes or the thread of its meals', async () => {
    const meals = await fixtureWeek();
    const [, , wed, thu, fri, sat, sun] = meals.map((meal) => meal.id) as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    // Дани's removal of Thursday, kept for its „Върни“; Поли's comment on Wednesday.
    await patchMeal(thu, { recipeId: null });
    const ownComment = (await thread(wed)).find(
      (line) => line.kind === 'comment',
    ) as { id?: string } | undefined;
    const release = answerLater(JSON.stringify(reworkFixture));
    const pending = await rework();
    const before = await plan();
    const lines = await thread(wed);

    const refused = [
      await inject('PATCH', `/api/menu/meals/${fri}`, {
        recipeId: recipeId(9),
      }),
      await inject('PATCH', `/api/menu/meals/${fri}`, {
        note: 'с повече чушки',
      }),
      await inject('PATCH', `/api/menu/meals/${sun}`, { note: null }),
      await inject('PATCH', `/api/menu/meals/${fri}`, { recipeId: null }),
      await inject('PATCH', `/api/menu/meals/${fri}`, {
        recipeId: recipeId(9),
        cookUserId: POLI.id,
      }),
      await inject('PATCH', `/api/menu/meals/${sun}`, {
        note: 'пица',
        servings: { [DANI.id]: 2, [POLI.id]: 1 },
      }),
      await inject('PUT', `/api/menu/meals/${wed}/vote`, { value: 'up' }),
      await inject('DELETE', `/api/menu/meals/${wed}/vote`, undefined, POLI.id),
      await inject('POST', `/api/menu/meals/${thu}/restore`),
      await inject('POST', `/api/menu/meals/${fri}/swap`, { withMealId: sat }),
      await inject('POST', `/api/menu/meals/${wed}/comments`, {
        body: 'Нещо с риба?',
      }),
      await inject(
        'DELETE',
        `/api/menu/comments/${ownComment?.id}`,
        undefined,
        POLI.id,
      ),
      await inject('POST', `/api/menu/meals/${fri}/replacements`),
    ];

    for (const response of refused) {
      expectReworking(response);
    }
    expect(await plan()).toEqual(before);
    expect(await thread(wed)).toEqual(lines);
    const replacement = await inject(
      'GET',
      `/api/menu/meals/${fri}/replacements`,
    );
    expect(replacement.statusCode).toBe(404);
    release();
    await finished(pending.id);
  });

  it('answers 409 menu_reworking to deleting the menu of a week not yet begun', async () => {
    await fixtureWeek();
    clock = BEFORE;
    const release = answerLater(JSON.stringify(reworkFixture));
    const pending = await rework();
    const { id } = (
      await inject('GET', `/api/menu/plans?weekStart=${WEEK}`)
    ).json().plan;

    expectReworking(await inject('DELETE', `/api/menu/plans/${id}`));

    release();
    await finished(pending.id);
    expect((await inject('DELETE', `/api/menu/plans/${id}`)).statusCode).toBe(
      204,
    );
  });

  it('lets the cook, the servings, „Аз“, „Извадих“ and the shopping list through', async () => {
    const { meals, release } = await reworkingWeek();
    const [, , wed, thu, fri] = meals.map((meal) => meal.id);

    const cook = await inject('PATCH', `/api/menu/meals/${fri}`, {
      cookUserId: POLI.id,
    });
    const servings = await inject('PATCH', `/api/menu/meals/${fri}`, {
      servings: { [DANI.id]: 2, [POLI.id]: 0 },
    });
    const claim = await inject('POST', `/api/menu/meals/${wed}/cook-claim`);
    const thawed = await inject('POST', `/api/menu/meals/${thu}/thawed`);
    const listed = await inject(
      'PUT',
      `/api/shopping-lists/${WEEK}/meals/${thu}`,
    );

    expect(
      [cook, servings, claim, thawed, listed].map((r) => r.statusCode),
    ).toEqual([200, 200, 204, 204, 200]);
    expect((await release()).status).toBe('done');
    expect((await plan()).meals[4]).toMatchObject({
      cookUserId: POLI.id,
      servings: { [DANI.id]: 2, [POLI.id]: 0 },
    });
  });

  it('takes changes again once the rework is done', async () => {
    const { meals, release } = await reworkingWeek();
    const thu = meals[3]?.id ?? '';

    expect((await release()).status).toBe('done');

    await vote(thu, 'down', POLI.id);
    await comment(thu, 'Пак скумрия?', POLI.id);
    await patchMeal(thu, { note: 'по-малко лимон' });
  });

  it('takes changes again once the rework has failed', async () => {
    const { meals, release } = await reworkingWeek({ days: [] });
    const thu = meals[3]?.id ?? '';

    expect((await release()).status).toBe('failed');

    await vote(thu, 'down', POLI.id);
    await comment(thu, 'Пак скумрия?', POLI.id);
    const asked = await inject('POST', `/api/menu/meals/${thu}/replacements`);
    expect(asked.statusCode).toBe(202);
    answerInTurn(JSON.stringify(replaceFixture));
    await waitForReplacement(asked.json().replacement.id);
  });
});

describe('reworked menu notification', () => {
  beforeEach(async () => {
    push.delivered.length = 0;
    for (const user of [DANI, POLI]) {
      const response = await inject(
        'PUT',
        '/api/notifications/subscription',
        deviceSubscription(user.name),
        user.id,
      );
      expect(response.statusCode).toBe(204);
    }
  });

  /** What each device got: the endpoint's owner and the notification. */
  function received() {
    return push.delivered.map(({ endpoint, payload }) => ({
      to: endpoint.split('/').at(-1),
      payload,
    }));
  }

  it('tells only the other who reworked the menu, how many dishes changed and the hint', async () => {
    answerInTurn(JSON.stringify(reworkFixture));
    await fixtureWeek();

    await finished((await rework({ weekStart: WEEK, hint: 'по-леко' })).id);

    await vi.waitFor(() => expect(received()).toHaveLength(1));
    expect(received()).toEqual([
      {
        to: POLI.name,
        payload: {
          kind: 'menu',
          userId: POLI.id,
          title: 'Преработено меню',
          body: 'Дани преработи менюто за 2–8 ноември · сменени 3 · „по-леко“',
          tag: `menu-${WEEK}`,
          url: `/menu?week=${WEEK}`,
        },
      },
    ]);
  });

  it('tells nobody when the AI changed no dish', async () => {
    const meals = await fixtureWeek();
    // Only Friday is left to fill: Поли takes Wednesday after all and Дани picks Saturday.
    await vote(meals[2]?.id ?? '', 'up', POLI.id);
    await patchMeal(meals[5]?.id ?? '', { recipeId: recipeId(2) });
    answerInTurn(
      JSON.stringify({
        days: [
          {
            date: '2026-11-06',
            slot: 'dinner',
            recipeId: recipeId(6),
            why: 'Чушките си остават.',
          },
        ],
        summary: 'Седмицата остава.',
      }),
    );
    // What the family did is in the digest; it goes first.
    clock = new Date(NOW.getTime() + 10 * 60_000);
    await app.reminders.run();
    push.delivered.length = 0;

    const done = await finished((await rework()).id);

    expect(done).toMatchObject({ status: 'done', changed: 0 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(received()).toEqual([]);
  });

  it('leaves the rework done and written when the notification cannot be sent', async () => {
    answerInTurn(JSON.stringify(reworkFixture));
    await fixtureWeek();
    const send = vi
      .spyOn(app.push, 'send')
      .mockRejectedValue(new Error('push service down'));

    try {
      const done = await finished((await rework()).id);

      expect(done).toMatchObject({ status: 'done', changed: 3 });
      await vi.waitFor(() => expect(send).toHaveBeenCalled());
      expect((await plan()).summary).toBe(reworkFixture.summary);
    } finally {
      send.mockRestore();
    }
  });

  it('does not count the AI’s changes in the „… по менюто“ digest', async () => {
    answerInTurn(JSON.stringify(reworkFixture));
    await fixtureWeek();
    // The family's own actions before the rework are quiet by now: the digest of them goes first.
    await app.reminders.run();
    push.delivered.length = 0;

    await finished((await rework()).id);
    await vi.waitFor(() => expect(received()).toHaveLength(1));
    clock = new Date(NOW.getTime() + 10 * 60_000);
    await app.reminders.run();

    expect(received().map(({ payload }) => payload.title)).toEqual([
      'Преработено меню',
    ]);
  });
});

describe('GET /api/menu/reworks', () => {
  it('answers the newest rework of the week, whoever asked', async () => {
    answerInTurn(JSON.stringify(reworkFixture));
    await fixtureWeek();
    const done = await finished((await rework(undefined, POLI.id)).id);

    const latest = await inject('GET', `/api/menu/reworks?weekStart=${WEEK}`);

    expect(latest.statusCode).toBe(200);
    expect(latest.json()).toEqual({ rework: done });
    expect(done.requestedBy).toBe(POLI.id);
  });

  it('answers 404 no_rework for a week nobody has reworked, and 404 for an unknown rework', async () => {
    const week = await inject('GET', `/api/menu/reworks?weekStart=${WEEK}`);
    const unknown = await inject(
      'GET',
      '/api/menu/reworks/99999999-9999-4999-8999-999999999999',
    );

    expect(week.statusCode).toBe(404);
    expect(week.json()).toMatchObject({ code: 'no_rework' });
    expect(unknown.statusCode).toBe(404);
  });
});

function pick(
  { recipeId, note, votes }: TestMeal | undefined = {} as TestMeal,
) {
  return { recipeId, note, votes };
}

async function waitForReplacement(id: string) {
  for (let i = 0; i < 250; i += 1) {
    const response = await inject('GET', `/api/menu/replacements/${id}`);
    if (response.json().replacement.status !== 'pending') {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`replacement ${id} still pending`);
}
