import type { AiContract, ContractFailure } from '@family/shared';
import { type ZodType, z } from 'zod';
import type { OpenClawConfig } from '../config.js';

/**
 * One agent turn of OpenClaw over its OpenAI-compatible `POST /v1/chat/completions` (docs/research/openclaw-invocation.md,
 * ADR-0004): one {@link AiContract} at a time, its input checked before sending, the answer validated with the contract's
 * output schema for that input, one retry with the issues. Shared by every AI contract (`recipe.suggest`, `menu.propose`).
 */

/** Why a call failed, as a short code that callers store as is (the `error` of an AI request). */
export type OpenClawFailure = Extract<
  ContractFailure,
  'timeout' | 'invalid_output' | `http_${number}`
>;

/** Every failure of the client that is not a bug or an abort by the caller. */
export abstract class OpenClawError extends Error {
  abstract readonly code: OpenClawFailure;
}

/** The gateway answered with a status other than 2xx. */
export class OpenClawHttpError extends OpenClawError {
  readonly status: number;
  readonly code: OpenClawFailure;

  constructor(status: number) {
    super(`OpenClaw answered HTTP ${status}`);
    this.name = 'OpenClawHttpError';
    this.status = status;
    this.code = `http_${status}`;
  }
}

/** No valid answer within `timeoutMs` (the whole call, retry included); the request was aborted, which also cancels the agent run. */
export class OpenClawTimeoutError extends OpenClawError {
  readonly code = 'timeout';

  constructor(timeoutMs: number) {
    super(`OpenClaw did not answer within ${timeoutMs} ms`);
    this.name = 'OpenClawTimeoutError';
  }
}

/** The agent's answer was not valid JSON for the contract, twice. `issues` are of the last attempt. */
export class OpenClawInvalidOutputError extends OpenClawError {
  readonly code = 'invalid_output';
  readonly issues: string;

  constructor(issues: string) {
    super(`OpenClaw output failed validation twice: ${issues}`);
    this.name = 'OpenClawInvalidOutputError';
    this.issues = issues;
  }
}

/**
 * What a failed background run stores as its `error`: the client's own code, `aborted` when the caller aborted
 * (e.g. the app shutting down), otherwise `error` (a bug).
 */
export function failureCode(error: unknown): ContractFailure {
  if (error instanceof OpenClawError) {
    return error.code;
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return 'aborted';
  }
  return 'error';
}

export interface CompleteOptions {
  /** Agent id (configuration, not part of the contract: ADR-0004); sent as `model: openclaw/<agent>`. */
  agent: string;
  /** Defaults to the client's `timeoutMs`; one budget for the whole call, the retry included. */
  timeoutMs?: number;
  /** Aborting it (e.g. the app shutting down) cancels the request like a timeout does. */
  signal?: AbortSignal;
  /**
   * Pictures that go with the input, outside its JSON (e.g. the photo of an import). They are parts of the last user
   * message, the only one whose images the gateway reads, so a retry sends them again there and drops them from the
   * first message (one copy per body: the gateway takes 20 MB).
   */
  images?: ContractImage[];
}

/** A picture for the agent: its bytes and their media type, sent as a `data:` URL. */
export interface ContractImage {
  mediaType: string;
  data: Buffer;
}

/** Where the client reports each attempt; Fastify's logger fits, and so does a script's own. */
export interface OpenClawLog {
  info(details: object, message: string): void;
  warn(details: object, message: string): void;
}

export interface OpenClawClient {
  /**
   * One answer of `contract` to `input`, valid for `contract.outputSchema(input)`. An input that fails
   * `contract.inputSchema` is a bug in the caller: it throws a plain `Error` (code `error`) and nothing is sent.
   */
  complete<I, O>(
    contract: AiContract<I, O>,
    input: I,
    options: CompleteOptions,
  ): Promise<O>;
}

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type Message = { role: 'user' | 'assistant'; content: string | ContentPart[] };

/** A user message of `text`, with `images` as its `image_url` parts when there are any. */
function userMessage(text: string, images: ContractImage[]): Message {
  if (images.length === 0) {
    return { role: 'user', content: text };
  }
  return {
    role: 'user',
    content: [
      { type: 'text', text },
      ...images.map(
        (image): ContentPart => ({
          type: 'image_url',
          image_url: {
            url: `data:${image.mediaType};base64,${image.data.toString('base64')}`,
          },
        }),
      ),
    ],
  };
}

const MAX_COMPLETION_TOKENS = 6000;

const completionSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable().optional() }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
  usage: z.unknown().optional(),
});

/**
 * The client for `config`, or `null` when there is no gateway password, which only AUTH_MODE=dev allows (`loadConfig()`
 * and `buildApp()` refuse it otherwise): then the routes that need OpenClaw answer 503 `openclaw_unavailable`.
 * `log` gets duration and token usage, never the request headers.
 */
export function createOpenClawClient(
  config: OpenClawConfig,
  log: OpenClawLog,
): OpenClawClient | null {
  const { gatewayPassword } = config;
  if (!gatewayPassword) {
    return null;
  }

  /** One attempt; `timeout` is the signal of the whole call, so a retry gets only what is left of the budget. */
  async function send(
    responseFormat: AiContract<unknown, unknown>['responseFormat'],
    options: CompleteOptions,
    messages: Message[],
    attempt: number,
    { timeout, timeoutMs }: { timeout: AbortSignal; timeoutMs: number },
  ): Promise<string> {
    const signal = options.signal
      ? AbortSignal.any([timeout, options.signal])
      : timeout;
    const started = performance.now();

    let response: Response;
    let body: unknown;
    try {
      response = await fetch(`${config.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${gatewayPassword}`,
          'content-type': 'application/json',
        },
        // No `user` field: each call is a fresh, stateless session. No `stream`.
        body: JSON.stringify({
          model: `openclaw/${options.agent}`,
          messages,
          response_format: {
            type: 'json_schema',
            json_schema: { ...responseFormat, strict: true },
          },
          max_completion_tokens: MAX_COMPLETION_TOKENS,
        }),
        signal,
      });
      body = await response.json().catch((error: unknown) => {
        if (signal.aborted) {
          throw error;
        }
        return undefined;
      });
    } catch (error) {
      if (timeout.aborted) {
        throw new OpenClawTimeoutError(timeoutMs);
      }
      throw error;
    }

    const durationMs = Math.round(performance.now() - started);
    if (!response.ok) {
      log.warn(
        { agent: options.agent, attempt, status: response.status, durationMs },
        'openclaw request failed',
      );
      throw new OpenClawHttpError(response.status);
    }

    const parsed = completionSchema.safeParse(body);
    const choice = parsed.success ? parsed.data.choices[0] : undefined;
    log.info(
      {
        agent: options.agent,
        attempt,
        durationMs,
        finishReason: choice?.finish_reason,
        usage: parsed.success ? parsed.data.usage : undefined,
      },
      'openclaw completion',
    );
    return choice?.message.content ?? '';
  }

  return {
    async complete(contract, input, options) {
      const checked = contract.inputSchema.safeParse(input);
      if (!checked.success) {
        throw new Error(
          `${contract.id}: the input does not match the contract: ${describeIssues(checked.error)}`,
        );
      }
      const outputSchema = contract.outputSchema(checked.data);
      const timeoutMs = options.timeoutMs ?? config.timeoutMs;
      const budget = { timeout: AbortSignal.timeout(timeoutMs), timeoutMs };
      const images = options.images ?? [];
      const inputText = JSON.stringify(checked.data);
      const messages: Message[] = [userMessage(inputText, images)];

      const first = await send(
        contract.responseFormat,
        options,
        messages,
        1,
        budget,
      );
      const firstResult = parseOutput(first, outputSchema);
      if (firstResult.ok) {
        return firstResult.value;
      }

      log.warn(
        { agent: options.agent, issues: firstResult.issues },
        'openclaw output invalid, retrying once',
      );
      const retry: Message[] = [
        { role: 'user', content: inputText },
        { role: 'assistant', content: first },
        userMessage(
          `Отговорът не мина валидация: ${sentence(firstResult.issues)} Върни само валиден JSON.`,
          images,
        ),
      ];
      const second = await send(
        contract.responseFormat,
        options,
        retry,
        2,
        budget,
      );
      const secondResult = parseOutput(second, outputSchema);
      if (secondResult.ok) {
        return secondResult.value;
      }
      throw new OpenClawInvalidOutputError(secondResult.issues);
    },
  };
}

type ParseResult<T> = { ok: true; value: T } | { ok: false; issues: string };

/** `content` without a surrounding ``` / ```json fence, parsed as JSON and checked with `schema`. */
function parseOutput<T>(content: string, schema: ZodType<T>): ParseResult<T> {
  let json: unknown;
  try {
    json = JSON.parse(stripFences(content));
  } catch {
    return { ok: false, issues: 'не е валиден JSON' };
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    return { ok: false, issues: describeIssues(result.error) };
  }
  return { ok: true, value: result.data };
}

function stripFences(content: string): string {
  const trimmed = content.trim();
  const fenced = /^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```$/.exec(trimmed);
  return fenced?.[1] ?? trimmed;
}

/** `text` as a sentence: with a full stop at the end, unless it already ends with one (`… или null.`). */
function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/** `path: message; …` of the first few issues, short enough to go back to the agent. */
function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 10)
    .map((issue) => `${issue.path.join('.') || '(корен)'}: ${issue.message}`)
    .join('; ');
}
