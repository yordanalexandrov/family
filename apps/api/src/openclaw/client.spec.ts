import type { AiContract } from '@family/shared';
import { delay, HttpResponse, http } from 'msw';
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
import {
  CHAT_COMPLETIONS_URL,
  completion,
  openclaw,
  TEST_OPENCLAW,
} from '../test/openclaw.js';
import {
  createOpenClawClient,
  failureCode,
  type OpenClawClient,
  OpenClawHttpError,
  OpenClawInvalidOutputError,
  OpenClawTimeoutError,
} from './client.js';

interface EchoInput {
  word: string;
  times: number;
}

interface EchoOutput {
  words: string[];
}

/** A contract only for these specs: the answer repeats `word` exactly `times` times, so it depends on the input. */
const echo: AiContract<EchoInput, EchoOutput> = {
  id: 'test.echo',
  inputSchema: z.object({
    word: z.string().trim().min(1),
    times: z.int().min(1),
  }),
  outputSchema: (input) =>
    z.object({ words: z.array(z.literal(input.word)).length(input.times) }),
  responseFormat: {
    name: 'test_echo',
    schema: {
      type: 'object',
      properties: { words: { type: 'array', items: { type: 'string' } } },
      required: ['words'],
      additionalProperties: false,
    },
  },
};

const AGENT = 'family-test';

const INPUT: EchoInput = { word: 'супа', times: 2 };

const VALID = JSON.stringify({ words: ['супа', 'супа'] });
/** Valid for `{ word: 'супа', times: 3 }`, not for {@link INPUT}. */
const THREE = JSON.stringify({ words: ['супа', 'супа', 'супа'] });

type LogEntry = { level: string; message: string; details: object };

let entries: LogEntry[];
let client: OpenClawClient;

/** The client as `buildApp()` makes it, against msw, its log kept in `entries`. */
function clientWith(timeoutMs = TEST_OPENCLAW.timeoutMs): OpenClawClient {
  const made = createOpenClawClient(
    { ...TEST_OPENCLAW, timeoutMs },
    {
      info: (details, message) =>
        entries.push({ level: 'info', message, details }),
      warn: (details, message) =>
        entries.push({ level: 'warn', message, details }),
    },
  );
  if (!made) {
    throw new Error('the test config has a gateway password');
  }
  return made;
}

beforeAll(() => openclaw.listen({ onUnhandledFrame: 'error' }));

afterEach(() => openclaw.resetHandlers());

afterAll(() => openclaw.close());

beforeEach(() => {
  entries = [];
  client = clientWith();
});

/** Answers the chat completions in turn with `contents` (the last one from then on); returns what it got. */
function answerInTurn(...contents: string[]) {
  const bodies: Record<string, unknown>[] = [];
  const authorizations: (string | null)[] = [];
  openclaw.use(
    http.post(CHAT_COMPLETIONS_URL, async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>);
      authorizations.push(request.headers.get('authorization'));
      const content = contents[bodies.length - 1] ?? contents.at(-1) ?? '';
      return HttpResponse.json(completion(content));
    }),
  );
  return { bodies, authorizations };
}

/** A gateway that never answers: the handler ends when the client aborts the request. */
function neverAnswered(request: Request): Promise<Response> {
  return new Promise((resolve) => {
    request.signal.addEventListener('abort', () =>
      resolve(HttpResponse.error()),
    );
  });
}

type SentBody = {
  model: string;
  messages: { role: string; content: string }[];
  response_format: unknown;
  max_completion_tokens: number;
};

describe('OpenClaw client: complete(contract, input)', () => {
  it('sends one stateless agent turn: the agent as model, the input as the only message, the contract’s json schema', async () => {
    const calls = answerInTurn(VALID);

    const output = await client.complete(echo, INPUT, { agent: AGENT });

    expect(output).toEqual({ words: ['супа', 'супа'] });
    expect(calls.bodies).toHaveLength(1);
    expect(calls.authorizations).toEqual(['Bearer test-gateway-password']);
    const body = calls.bodies[0] as SentBody;
    expect(body.model).toBe('openclaw/family-test');
    expect(body).not.toHaveProperty('user');
    expect(body).not.toHaveProperty('stream');
    expect(body.max_completion_tokens).toBe(6000);
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: { ...echo.responseFormat, strict: true },
    });
    expect(body.messages).toEqual([
      { role: 'user', content: JSON.stringify(INPUT) },
    ]);
  });

  it('refuses an input that fails the contract’s input schema as a bug, without a request', async () => {
    const calls = answerInTurn(VALID);

    const error = await client
      .complete(echo, { word: '  ', times: 2 }, { agent: AGENT })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('test.echo');
    expect(failureCode(error)).toBe('error');
    expect(calls.bodies).toEqual([]);
  });

  it('checks the answer with the output schema for this input', async () => {
    answerInTurn(THREE);

    await expect(
      client.complete(echo, { word: 'супа', times: 3 }, { agent: AGENT }),
    ).resolves.toEqual({ words: ['супа', 'супа', 'супа'] });

    const error = await client
      .complete(echo, INPUT, { agent: AGENT })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(OpenClawInvalidOutputError);
    expect(failureCode(error)).toBe('invalid_output');
  });

  it('accepts JSON wrapped in a ``` fence', async () => {
    answerInTurn(`\`\`\`json\n${VALID}\n\`\`\``);

    await expect(
      client.complete(echo, INPUT, { agent: AGENT }),
    ).resolves.toEqual({ words: ['супа', 'супа'] });
  });

  it('retries once with the validation issues when the first answer is invalid', async () => {
    const calls = answerInTurn(THREE, VALID);

    const output = await client.complete(echo, INPUT, { agent: AGENT });

    expect(output).toEqual({ words: ['супа', 'супа'] });
    expect(calls.bodies).toHaveLength(2);
    const retry = calls.bodies[1] as SentBody;
    expect(retry.messages.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
    ]);
    expect(retry.messages[1]?.content).toBe(THREE);
    expect(retry.messages[2]?.content).toMatch(
      /^Отговорът не мина валидация: words: .+\. Върни само валиден JSON\.$/,
    );
  });

  it('does not double the full stop when the last issue already ends with one', async () => {
    const dotted: AiContract<EchoInput, EchoOutput> = {
      ...echo,
      outputSchema: () =>
        z.object({
          words: z.array(z.string(), { error: 'масив от думи или null.' }),
        }),
    };
    const calls = answerInTurn(JSON.stringify({ words: 5 }), VALID);

    await client.complete(dotted, INPUT, { agent: AGENT });

    const retry = calls.bodies[1] as SentBody;
    expect(retry.messages[2]?.content).toBe(
      'Отговорът не мина валидация: words: масив от думи или null. Върни само валиден JSON.',
    );
  });

  it('sends images as image_url parts of the input message, after the JSON input as text', async () => {
    const calls = answerInTurn(VALID);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

    await client.complete(echo, INPUT, {
      agent: AGENT,
      images: [{ mediaType: 'image/jpeg', data: jpeg }],
    });

    const body = calls.bodies[0] as {
      messages: { role: string; content: unknown }[];
    };
    expect(body.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: JSON.stringify(INPUT) },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
            },
          },
        ],
      },
    ]);
  });

  it('sends the images again in the last message of the retry, and only there', async () => {
    const calls = answerInTurn(THREE, VALID);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const image = {
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${png.toString('base64')}` },
    };

    const output = await client.complete(echo, INPUT, {
      agent: AGENT,
      images: [{ mediaType: 'image/png', data: png }],
    });

    expect(output).toEqual({ words: ['супа', 'супа'] });
    const retry = calls.bodies[1] as {
      messages: { role: string; content: unknown }[];
    };
    expect(retry.messages).toEqual([
      { role: 'user', content: JSON.stringify(INPUT) },
      { role: 'assistant', content: THREE },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: expect.stringMatching(/^Отговорът не мина валидация: /),
          },
          image,
        ],
      },
    ]);
  });

  it('fails with invalid_output after two invalid answers', async () => {
    const calls = answerInTurn('Ето думите: …', THREE);

    const error = await client
      .complete(echo, INPUT, { agent: AGENT })
      .catch((caught: unknown) => caught);

    expect(calls.bodies).toHaveLength(2);
    expect(error).toBeInstanceOf(OpenClawInvalidOutputError);
    expect((error as OpenClawInvalidOutputError).issues).toContain('words');
  });

  it('fails with http_<status> when the gateway answers an error, without a retry', async () => {
    let calls = 0;
    openclaw.use(
      http.post(CHAT_COMPLETIONS_URL, () => {
        calls += 1;
        return HttpResponse.json(
          { error: { message: 'agent run was cancelled', type: 'api_error' } },
          { status: 500 },
        );
      }),
    );

    const error = await client
      .complete(echo, INPUT, { agent: AGENT })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(OpenClawHttpError);
    expect(failureCode(error)).toBe('http_500');
    expect(calls).toBe(1);
  });

  it('counts the timeout for the whole call, the retry included', async () => {
    const answers = [THREE, VALID];
    let calls = 0;
    openclaw.use(
      // Each attempt alone fits in 500 ms, both together do not.
      http.post(CHAT_COMPLETIONS_URL, async () => {
        const content = answers[calls] ?? VALID;
        calls += 1;
        await delay(300);
        return HttpResponse.json(completion(content));
      }),
    );

    const error = await client
      .complete(echo, INPUT, { agent: AGENT, timeoutMs: 500 })
      .catch((caught: unknown) => caught);

    expect(calls).toBe(2);
    expect(error).toBeInstanceOf(OpenClawTimeoutError);
  });

  it('fails with timeout when the gateway does not answer in time', async () => {
    client = clientWith(100);
    openclaw.use(
      http.post(CHAT_COMPLETIONS_URL, ({ request }) => neverAnswered(request)),
    );

    const error = await client
      .complete(echo, INPUT, { agent: AGENT })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(OpenClawTimeoutError);
    expect(failureCode(error)).toBe('timeout');
  });

  it('stops when the caller aborts, as aborted', async () => {
    openclaw.use(
      http.post(CHAT_COMPLETIONS_URL, ({ request }) => neverAnswered(request)),
    );
    const caller = new AbortController();

    const pending = client
      .complete(echo, INPUT, { agent: AGENT, signal: caller.signal })
      .catch((caught: unknown) => caught);
    caller.abort();

    expect(failureCode(await pending)).toBe('aborted');
  });

  it('logs the duration and token usage of each attempt, never the gateway password', async () => {
    answerInTurn(THREE, VALID);

    await client.complete(echo, INPUT, { agent: AGENT });

    const completions = entries.filter(
      (entry) => entry.message === 'openclaw completion',
    );
    expect(completions).toHaveLength(2);
    expect(completions[0]?.details).toMatchObject({
      agent: AGENT,
      attempt: 1,
      durationMs: expect.any(Number),
      usage: { total_tokens: 150 },
    });
    expect(JSON.stringify(entries)).not.toContain(
      TEST_OPENCLAW.gatewayPassword,
    );
  });
});
