import { type ZodType, z } from 'zod';
import type { OpenClawConfig } from '../config.js';

/**
 * One agent turn of OpenClaw over its OpenAI-compatible `POST /v1/chat/completions` (docs/research/openclaw-invocation.md,
 * ADR-0004): fixed JSON in, JSON out validated with the contract's Zod schema, one retry with the issues. Shared by every
 * AI contract (`recipe.suggest`, later `menu.propose`).
 */

/** The gateway answered with a status other than 2xx. */
export class OpenClawHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`OpenClaw answered HTTP ${status}`);
    this.name = 'OpenClawHttpError';
    this.status = status;
  }
}

/** No answer within `timeoutMs`; the request was aborted, which also cancels the agent run. */
export class OpenClawTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`OpenClaw did not answer within ${timeoutMs} ms`);
    this.name = 'OpenClawTimeoutError';
  }
}

/** The agent's answer was not valid JSON for the contract, twice. `issues` are of the last attempt. */
export class OpenClawInvalidOutputError extends Error {
  readonly issues: string;

  constructor(issues: string) {
    super(`OpenClaw output failed validation twice: ${issues}`);
    this.name = 'OpenClawInvalidOutputError';
    this.issues = issues;
  }
}

export interface CompleteOptions<T> {
  /** Agent id; sent as `model: openclaw/<agent>`. */
  agent: string;
  /** The contract input, sent as the only user message (`JSON.stringify`). */
  input: unknown;
  outputSchema: ZodType<T>;
  /** `response_format.json_schema`: best effort on the gateway's side, so the output is still parsed with `outputSchema`. */
  jsonSchema: { name: string; schema: Record<string, unknown> };
  /** Defaults to the client's `timeoutMs`; covers each attempt. */
  timeoutMs?: number;
  /** Aborting it (e.g. the app shutting down) cancels the request like a timeout does. */
  signal?: AbortSignal;
}

/** Where the client reports each attempt; Fastify's logger fits, and so does a script's own. */
export interface OpenClawLog {
  info(details: object, message: string): void;
  warn(details: object, message: string): void;
}

export interface OpenClawClient {
  complete<T>(options: CompleteOptions<T>): Promise<T>;
}

type Message = { role: 'user' | 'assistant'; content: string };

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
 * The client for `config`, or `null` when there is no gateway password (local dev): then the routes that need
 * OpenClaw answer 503 `openclaw_unavailable`. `log` gets duration and token usage, never the request headers.
 */
export function createOpenClawClient(
  config: OpenClawConfig,
  log: OpenClawLog,
): OpenClawClient | null {
  const { gatewayPassword } = config;
  if (!gatewayPassword) {
    return null;
  }

  async function send<T>(
    options: CompleteOptions<T>,
    messages: Message[],
    attempt: number,
  ): Promise<string> {
    const timeoutMs = options.timeoutMs ?? config.timeoutMs;
    const timeout = AbortSignal.timeout(timeoutMs);
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
            json_schema: { ...options.jsonSchema, strict: true },
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
    async complete(options) {
      const messages: Message[] = [
        { role: 'user', content: JSON.stringify(options.input) },
      ];

      const first = await send(options, messages, 1);
      const firstResult = parseOutput(first, options.outputSchema);
      if (firstResult.ok) {
        return firstResult.value;
      }

      log.warn(
        { agent: options.agent, issues: firstResult.issues },
        'openclaw output invalid, retrying once',
      );
      messages.push(
        { role: 'assistant', content: first },
        {
          role: 'user',
          content: `Отговорът не мина валидация: ${firstResult.issues}. Върни само валиден JSON.`,
        },
      );
      const second = await send(options, messages, 2);
      const secondResult = parseOutput(second, options.outputSchema);
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

/** `path: message; …` of the first few issues, short enough to go back to the agent. */
function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 10)
    .map((issue) => `${issue.path.join('.') || '(корен)'}: ${issue.message}`)
    .join('; ');
}
