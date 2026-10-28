import type { AiContract } from '@family/shared';
import { eq } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import { HttpResponse, http } from 'msw';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { z } from 'zod';
import { recipeSuggestionRequest } from '../db/schema/food.js';
import { createOpenClawClient } from '../openclaw/client.js';
import { testDb } from '../test/db.js';
import {
  CHAT_COMPLETIONS_URL,
  completion,
  openclaw,
  TEST_OPENCLAW,
} from '../test/openclaw.js';
import { DANI } from '../test/users.js';
import {
  ContractRequestFailure,
  type ContractRequestStore,
  type ContractRequests,
  createContractRequests,
} from './contract-requests.js';
import { ConflictError, OpenClawUnavailableError } from './errors.js';

// The lifecycle of an AI request, whatever its contract: a tiny contract and a store of its own, written into the
// existing `recipe_suggestion_request` table (it has the common columns), against the test database and msw.

type EchoInput = { word: string };
type EchoOutput = { word: string };

const echo: AiContract<EchoInput, EchoOutput> = {
  id: 'test.echo',
  inputSchema: z.object({ word: z.string().min(1) }),
  outputSchema: (input) => z.object({ word: z.literal(input.word) }),
  responseFormat: { name: 'test_echo', schema: { type: 'object' } },
};

type EchoRequest = {
  id: string;
  word: string;
  status: string;
  error: string | null;
  finishedAt: Date | null;
  /** What `onDone` wrote. */
  tags: string[];
};

const table = recipeSuggestionRequest;

function toRequest(row: typeof table.$inferSelect): EchoRequest {
  return {
    id: row.id,
    word: row.hint ?? '',
    status: row.status,
    error: row.error,
    finishedAt: row.finishedAt,
    tags: row.tags,
  };
}

/** Refuses the word `taken` inside the insert, as menu refuses a taken week. */
const store: ContractRequestStore<
  { word: string; picture?: string },
  EchoRequest,
  EchoInput,
  EchoOutput
> = {
  table,
  async insert(tx, params, requestedBy) {
    if (params.word === 'taken') {
      throw new ConflictError('taken');
    }
    const [row] = await tx
      .insert(table)
      .values({ slots: ['lunch'], hint: params.word, requestedBy })
      .returning();
    if (!row) {
      throw new Error('no row');
    }
    return toRequest(row);
  },
  async find(db, id) {
    const [row] = await db.select().from(table).where(eq(table.id, id));
    return row && toRequest(row);
  },
  async buildInput(_db, request) {
    if (request.word === 'unreachable') {
      throw new ContractRequestFailure('fetch_failed', 'the page did not open');
    }
    return { word: request.word };
  },
  async onDone(tx, request, output) {
    if (output.word === 'boom') {
      throw new Error('onDone failed');
    }
    await tx
      .update(table)
      .set({ tags: ['quick'] })
      .where(eq(table.id, request.id));
  },
  images(params) {
    return params.picture
      ? [{ mediaType: 'image/png', data: Buffer.from(params.picture) }]
      : [];
  },
  noResults(output) {
    return output.word === 'нищо' || output.word === 'нищо-гърми'
      ? 'Агентът не намери нищо.'
      : null;
  },
  /** Marks the request `batch` when it gets the reason of `noResults`; for `нищо-гърми` it writes, then fails. */
  async onNoResults(tx, request, reason) {
    await tx
      .update(table)
      .set({ tags: reason === 'Агентът не намери нищо.' ? ['batch'] : [] })
      .where(eq(table.id, request.id));
    if (request.word === 'нищо-гърми') {
      throw new Error('onNoResults failed');
    }
  },
};

const silent = { info() {}, warn() {}, error() {} };

let requests: ContractRequests;

function create(
  client = createOpenClawClient(TEST_OPENCLAW, silent),
  log: Pick<FastifyBaseLogger, 'warn' | 'error'> = silent,
) {
  requests = createContractRequests({ db: testDb(), client, log });
  return requests.register(echo, store, 'family-test');
}

type Content =
  | string
  | (
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    )[];

/** Answers every chat completion with `{ word }` of the request's input; returns the contents it got. */
function echoing() {
  const contents: Content[] = [];
  openclaw.use(
    http.post(CHAT_COMPLETIONS_URL, async ({ request }) => {
      const body = (await request.json()) as {
        messages: { content: Content }[];
      };
      const content = body.messages[0]?.content ?? '{}';
      contents.push(content);
      const text =
        typeof content === 'string'
          ? content
          : (content.find((part) => part.type === 'text')?.text ?? '{}');
      return HttpResponse.json(completion(text));
    }),
  );
  return { contents };
}

/** Polls the handle until the background run has finished. */
async function finished(
  handle: ReturnType<typeof create>,
  id: string,
): Promise<EchoRequest> {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const request = await handle.get(id);
    if (request && request.status !== 'pending') {
      return request;
    }
    if (Date.now() > deadline) {
      throw new Error(`request ${id} still pending`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

beforeAll(() => openclaw.listen({ onUnhandledFrame: 'error' }));

beforeEach(() => echoing());

afterEach(async () => {
  await requests.close();
  openclaw.resetHandlers();
});

afterAll(() => openclaw.close());

describe('AI requests (contract-requests)', () => {
  it('stores a pending request, then writes the answer and marks it done in one go', async () => {
    const handle = create();

    const request = await handle.request({ word: 'супа' }, DANI.id);

    expect(request).toMatchObject({ word: 'супа', status: 'pending' });
    const done = await finished(handle, request.id);
    expect(done).toMatchObject({
      status: 'done',
      error: null,
      tags: ['quick'],
    });
    expect(done.finishedAt).toEqual(expect.any(Date));
  });

  it('marks the request failed with the failure code when the agent fails', async () => {
    openclaw.use(
      http.post(CHAT_COMPLETIONS_URL, () =>
        HttpResponse.json({}, { status: 502 }),
      ),
    );
    const handle = create();

    const request = await handle.request({ word: 'супа' }, DANI.id);

    expect(await finished(handle, request.id)).toMatchObject({
      status: 'failed',
      error: 'http_502',
      tags: [],
    });
  });

  it('ends failed with the code the store gives when it cannot build the input, without asking the agent', async () => {
    let calls = 0;
    openclaw.use(
      http.post(CHAT_COMPLETIONS_URL, () => {
        calls++;
        return HttpResponse.json({}, { status: 502 });
      }),
    );
    const handle = create();

    const request = await handle.request({ word: 'unreachable' }, DANI.id);

    expect(await finished(handle, request.id)).toMatchObject({
      status: 'failed',
      error: 'fetch_failed',
    });
    expect(calls).toBe(0);
  });

  it('fails as no_results without writing the answer when the store finds nothing in it, keeps the reason (onNoResults) and logs why', async () => {
    const warnings: [object, string][] = [];
    const handle = create(undefined, {
      ...silent,
      warn: ((details: object, message: string) => {
        warnings.push([details, message]);
      }) as FastifyBaseLogger['warn'],
    });

    const request = await handle.request({ word: 'нищо' }, DANI.id);

    expect(await finished(handle, request.id)).toMatchObject({
      status: 'failed',
      error: 'no_results',
      tags: ['batch'],
    });
    expect(warnings).toEqual([
      [
        { requestId: request.id, noResults: 'Агентът не намери нищо.' },
        'test.echo found no results',
      ],
    ]);
  });

  it('leaves no trace of onNoResults when it fails: its transaction is the one that marks the request', async () => {
    const handle = create();

    const request = await handle.request({ word: 'нищо-гърми' }, DANI.id);

    expect(await finished(handle, request.id)).toMatchObject({
      status: 'failed',
      error: 'error',
      tags: [],
    });
  });

  it('sends the pictures the store takes from the params next to the input, and none without them', async () => {
    const agent = echoing();
    const handle = create();

    const pictured = await handle.request(
      { word: 'супа', picture: 'png-bytes' },
      DANI.id,
    );
    expect((await finished(handle, pictured.id)).status).toBe('done');
    const plain = await handle.request({ word: 'боб' }, DANI.id);
    expect((await finished(handle, plain.id)).status).toBe('done');

    expect(agent.contents).toEqual([
      [
        { type: 'text', text: '{"word":"супа"}' },
        {
          type: 'image_url',
          image_url: {
            url: `data:image/png;base64,${Buffer.from('png-bytes').toString('base64')}`,
          },
        },
      ],
      '{"word":"боб"}',
    ]);
  });

  it('fails as error, not done, when writing the answer fails', async () => {
    const handle = create();

    const request = await handle.request({ word: 'boom' }, DANI.id);

    expect(await finished(handle, request.id)).toMatchObject({
      status: 'failed',
      error: 'error',
      tags: [],
    });
  });

  it('refuses with 503 and stores nothing when OpenClaw is not configured', async () => {
    const handle = create(null);

    await expect(handle.request({ word: 'супа' }, DANI.id)).rejects.toThrow(
      OpenClawUnavailableError,
    );
    expect(await testDb().select().from(table)).toEqual([]);
  });

  it('lets the store refuse a request inside its insert, and stores nothing', async () => {
    const handle = create();

    await expect(handle.request({ word: 'taken' }, DANI.id)).rejects.toThrow(
      ConflictError,
    );
    expect(await testDb().select().from(table)).toEqual([]);
  });

  it('fails pending requests older than 10 minutes as stale, and leaves younger ones pending', async () => {
    const handle = create();
    const [old, young] = await testDb()
      .insert(table)
      .values([
        {
          slots: ['lunch'],
          hint: 'old',
          requestedBy: DANI.id,
          createdAt: new Date(Date.now() - 11 * 60 * 1000),
        },
        {
          slots: ['lunch'],
          hint: 'young',
          requestedBy: DANI.id,
          createdAt: new Date(Date.now() - 60 * 1000),
        },
      ])
      .returning({ id: table.id });

    await requests.failStale();

    const stale = await handle.get(old?.id ?? '');
    expect(stale).toMatchObject({ status: 'failed', error: 'stale' });
    expect(stale?.finishedAt).toEqual(expect.any(Date));
    expect((await handle.get(young?.id ?? ''))?.status).toBe('pending');
  });

  it('aborts the runs in flight on close and waits for them: they end failed/aborted', async () => {
    let reached = () => {};
    const atGateway = new Promise<void>((resolve) => {
      reached = resolve;
    });
    openclaw.use(
      http.post(CHAT_COMPLETIONS_URL, ({ request }) => {
        reached();
        return new Promise<Response>((resolve) =>
          request.signal.addEventListener('abort', () =>
            resolve(HttpResponse.error()),
          ),
        );
      }),
    );
    const handle = create();
    const request = await handle.request({ word: 'супа' }, DANI.id);
    await atGateway;

    await requests.close();

    expect(await handle.get(request.id)).toMatchObject({
      status: 'failed',
      error: 'aborted',
    });
  });
});
