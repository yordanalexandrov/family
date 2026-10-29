import type { CONTRACT_FAILURES, ContractFailure } from '@family/shared';
import { ApiError } from '../api/client';

/**
 * Общото на AI заявките (меню, смяна на ястие, предложения за рецепти, внасяне): `POST` → `pending`, клиентът пита отново,
 * докато заявката не е `done`/`failed`; кодовете на `failed` са едни и същи.
 */

/** Колко често се пита за заявка, която още е `pending`. */
export const POLL_INTERVAL_MS = 3000;

/** И за отказаната заявка (503 `openclaw_unavailable`), и за грешка `http_*` на агента. */
const AI_UNAVAILABLE = 'AI не е на разположение в момента';

/** Какво е поискано от AI: меню за седмица, друго ястие, предложения за рецепти или внасяне на рецепта. */
export type AiRequestKind = 'menu' | 'replace' | 'suggest' | 'import';

/** Полетата на заявката, от които зависи съобщението; общи за всички AI заявки. */
export interface FailedAiRequest {
  error?: ContractFailure;
  createdAt: string;
  finishedAt?: string;
}

/** Какво AI не е успяло да направи и какво може човекът оттук. */
const KINDS: Record<AiRequestKind, { failed: string; next: string }> = {
  menu: {
    failed: 'AI не успя да предложи меню',
    next: 'Опитай пак или започни празно.',
  },
  replace: {
    failed: 'AI не успя да предложи друго ястие',
    next: 'Опитай пак или избери сам.',
  },
  suggest: {
    failed: 'AI не успя да предложи рецепти',
    next: 'Опитай пак или с друга подсказка.',
  },
  import: {
    failed: 'AI не успя да прочете рецептата',
    next: 'Опитай пак.',
  },
};

type NamedFailure = (typeof CONTRACT_FAILURES)[number];

function isHttpFailure(
  error: ContractFailure,
): error is Extract<ContractFailure, `http_${number}`> {
  return error.startsWith('http_');
}

/** Кодовете, чийто текст казва сам и причината, и действието. */
const OWN_MESSAGES: Partial<
  Record<NamedFailure, Partial<Record<AiRequestKind, string>>>
> = {
  no_results: {
    suggest: 'Не намерих подходящи рецепти. Опитай пак или с друга подсказка.',
    import: 'Не намерих рецепта в източника.',
  },
  fetch_blocked: {
    import: 'Сайтът не позволява автоматично четене — постави текста',
  },
  fetch_failed: { import: 'Страницата не се отвори — постави текста' },
};

const MINUTE_MS = 60_000;

/** „3 минути“, „1 минута“, под минута — „40 секунди“. */
function waited(ms: number): string {
  if (ms < MINUTE_MS) {
    const seconds = Math.max(1, Math.round(ms / 1000));
    return seconds === 1 ? '1 секунда' : `${seconds} секунди`;
  }
  const minutes = Math.round(ms / MINUTE_MS);
  return minutes === 1 ? '1 минута' : `${minutes} минути`;
}

/** Причината, преди действието: изречение без точка. */
function reason(kind: AiRequestKind, request: FailedAiRequest): string {
  const { error } = request;
  if (error === 'timeout') {
    if (request.finishedAt === undefined) {
      return 'AI не отговори навреме';
    }
    const ms = Date.parse(request.finishedAt) - Date.parse(request.createdAt);
    return `AI не отговори за ${waited(ms)}`;
  }
  if (error === 'invalid_output') {
    return 'AI върна отговор, който не мога да прочета';
  }
  if (error !== undefined && isHttpFailure(error)) {
    return AI_UNAVAILABLE;
  }
  if (error === 'stale') {
    return `${KINDS[kind].failed}: сървърът се рестартира междувременно`;
  }
  if (error === 'aborted') {
    return `${KINDS[kind].failed}: заявката беше прекъсната`;
  }
  return KINDS[kind].failed;
}

/**
 * Съобщение за неуспешна AI заявка от името на приложението: какво не е станало и какво може човекът, без кодове.
 * `timeout` казва колко е чакано (`createdAt` → `finishedAt`).
 */
export function failureMessage(
  kind: AiRequestKind,
  request: FailedAiRequest,
): string {
  const { error } = request;
  const own =
    error === undefined || isHttpFailure(error)
      ? undefined
      : OWN_MESSAGES[error]?.[kind];
  return own ?? `${reason(kind, request)}. ${KINDS[kind].next}`;
}

/** Грешка при пускане на заявка: 503 `openclaw_unavailable` с приятелско съобщение, другите както са. */
export function requestErrorFor(error: unknown): unknown {
  if (error instanceof ApiError && error.code === 'openclaw_unavailable') {
    return new ApiError(error.status, error.code, AI_UNAVAILABLE, error.body);
  }
  return error;
}
