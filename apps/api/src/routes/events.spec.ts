import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
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
import { DANI } from '../test/users.js';

/** Wednesday 28 October 2026, 10:00 in Sofia: the weeks below have not begun. */
const NOW = new Date('2026-10-28T08:00:00Z');
const WEEK = '2026-11-02';
const OTHER_WEEK = '2026-11-09';

let app: FastifyInstance;
let baseUrl: string;

beforeAll(async () => {
  app = buildTestApp({ now: () => NOW });
  // A real port: an SSE response never ends, so `app.inject()` cannot read it.
  await app.listen({ port: 0, host: '127.0.0.1' });
  baseUrl = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});

afterAll(() => app.close());

/** The open streams of a test, closed after it. */
const streams: AbortController[] = [];

afterEach(() => {
  for (const stream of streams.splice(0)) {
    stream.abort();
  }
  vi.useRealTimers();
});

/** An SSE client (without `X-Acting-User`, as `EventSource` sends none) that reads the stream message by message. */
async function connect() {
  const abort = new AbortController();
  streams.push(abort);
  const response = await fetch(`${baseUrl}/api/events`, {
    signal: abort.signal,
  });
  if (!response.body) {
    throw new Error('no body');
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  return {
    response,
    abort: () => abort.abort(),
    /** The next message (the text before a blank line), comments included. */
    async next(): Promise<string> {
      for (;;) {
        const end = buffer.indexOf('\n\n');
        if (end >= 0) {
          const message = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          return message;
        }
        const { value, done } = await reader.read();
        if (done) {
          throw new Error('stream ended');
        }
        buffer += value;
      }
    },
    /** The next event, skipping comments (`: …`). */
    async nextEvent(): Promise<{ event: string; data: unknown }> {
      for (;;) {
        const message = await this.next();
        if (message.startsWith(':')) {
          continue;
        }
        const field = (name: string) =>
          message
            .split('\n')
            .find((line) => line.startsWith(`${name}: `))
            ?.slice(name.length + 2);
        return {
          event: field('event') ?? '',
          data: JSON.parse(field('data') ?? 'null'),
        };
      }
    },
  };
}

function inject(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
) {
  return app.inject({
    method,
    url,
    headers: { 'x-acting-user': DANI.id },
    payload,
  });
}

async function createPlan(weekStart: string) {
  const response = await inject('POST', '/api/menu/plans', { weekStart });
  expect(response.statusCode).toBe(201);
  return response.json().plan as { id: string; meals: { id: string }[] };
}

describe('GET /api/events', () => {
  beforeEach(async () => {
    await createPlan(WEEK);
  });

  it('answers an event stream that no proxy buffers, without an acting user', async () => {
    const client = await connect();

    expect(client.response.status).toBe(200);
    expect(client.response.headers.get('content-type')).toBe(
      'text/event-stream',
    );
    expect(client.response.headers.get('cache-control')).toBe('no-cache');
    expect(client.response.headers.get('x-accel-buffering')).toBe('no');
  });

  it('signals menu.changed and shopping.changed for the meal’s week after a PATCH', async () => {
    const plan = (
      await inject('GET', `/api/menu/plans?weekStart=${WEEK}`)
    ).json().plan as { meals: { id: string }[] };
    const client = await connect();

    const response = await inject(
      'PATCH',
      `/api/menu/meals/${plan.meals[0]?.id}`,
      {
        note: 'остатъци',
      },
    );

    expect(response.statusCode).toBe(200);
    expect(await client.nextEvent()).toEqual({
      event: 'menu.changed',
      data: { type: 'menu.changed', weekStart: WEEK },
    });
    expect(await client.nextEvent()).toEqual({
      event: 'shopping.changed',
      data: { type: 'shopping.changed', weekStart: WEEK },
    });
  });

  it('signals nothing for a refused change', async () => {
    const plan = (
      await inject('GET', `/api/menu/plans?weekStart=${WEEK}`)
    ).json().plan as { meals: { id: string }[] };
    const client = await connect();

    const refused = await inject(
      'PATCH',
      `/api/menu/meals/${plan.meals[0]?.id}`,
      {
        recipeId: '99999999-9999-4999-8999-999999999999',
      },
    );
    // A change that goes through afterwards: its event is the first one the client gets.
    await createPlan(OTHER_WEEK);

    expect(refused.statusCode).toBe(400);
    expect(await client.nextEvent()).toEqual({
      event: 'menu.changed',
      data: { type: 'menu.changed', weekStart: OTHER_WEEK },
    });
  });

  it('signals a created and a deleted plan', async () => {
    const client = await connect();

    const plan = await createPlan(OTHER_WEEK);
    const deleted = await inject('DELETE', `/api/menu/plans/${plan.id}`);

    expect(deleted.statusCode).toBe(204);
    const events = [];
    for (let i = 0; i < 4; i += 1) {
      events.push(await client.nextEvent());
    }
    expect(events.map((event) => event.event)).toEqual([
      'menu.changed',
      'shopping.changed',
      'menu.changed',
      'shopping.changed',
    ]);
  });

  it('signals shopping.changed after a check, a hidden row and a manual row', async () => {
    const client = await connect();

    const added = await inject('POST', `/api/shopping-lists/${WEEK}/items`, {
      title: 'Батерии',
    });
    const key = added.json().item.key as string;
    const checked = await inject(
      'PUT',
      `/api/shopping-lists/${WEEK}/items/${encodeURIComponent(key)}/checked`,
      { checked: true },
    );
    const deleted = await inject(
      'DELETE',
      `/api/shopping-lists/${WEEK}/items/${encodeURIComponent(key)}`,
    );

    expect([added.statusCode, checked.statusCode, deleted.statusCode]).toEqual([
      201, 200, 204,
    ]);
    for (let i = 0; i < 3; i += 1) {
      expect(await client.nextEvent()).toEqual({
        event: 'shopping.changed',
        data: { type: 'shopping.changed', weekStart: WEEK },
      });
    }
  });

  it('sends a heartbeat comment every 25 s', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const client = await connect();

    vi.advanceTimersByTime(25_000);

    let message = await client.next();
    while (message !== ': ping') {
      message = await client.next();
    }
    expect(message).toBe(': ping');
  });

  it('unsubscribes a client that closes the stream', async () => {
    const client = await connect();
    expect(app.events.subscribers).toBe(1);

    client.abort();

    await vi.waitFor(() => expect(app.events.subscribers).toBe(0));
  });
});
