import type { SUGGESTION_FAILURES, SuggestionFailure } from '@family/shared';
import { ApiError } from '../api/client';

/**
 * Общото на AI заявките (предложения за рецепти, предложение за меню): `POST` → `pending`, клиентът пита отново,
 * докато заявката не е `done`/`failed`; кодовете на `failed` са едни и същи.
 */

/** Колко често се пита за заявка, която още е `pending`. */
export const POLL_INTERVAL_MS = 3000;

const OPENCLAW_UNAVAILABLE = 'AI не е наличен в момента';

const TRY_AGAIN = 'Нещо се обърка, опитай пак';

const FAILURE_MESSAGES: Record<(typeof SUGGESTION_FAILURES)[number], string> = {
  timeout: 'Не успях навреме, опитай пак',
  invalid_output: 'Получих нечетим отговор',
  stale: 'Сървърът се рестартира, докато търсех. Опитай пак',
  aborted: 'Търсенето беше прекъснато. Опитай пак',
  error: TRY_AGAIN,
};

function isHttpFailure(
  error: SuggestionFailure,
): error is Extract<SuggestionFailure, `http_${number}`> {
  return error.startsWith('http_');
}

/** Съобщение по кода на неуспешна заявка (`request.error`). */
export function failureMessage(error: SuggestionFailure | undefined): string {
  if (error === undefined) {
    return TRY_AGAIN;
  }
  if (isHttpFailure(error)) {
    return `AI отговори с грешка ${error.slice('http_'.length)}, опитай пак`;
  }
  return FAILURE_MESSAGES[error];
}

/** Грешка при пускане на заявка: 503 `openclaw_unavailable` с приятелско съобщение, другите както са. */
export function requestErrorFor(error: unknown): unknown {
  if (error instanceof ApiError && error.code === 'openclaw_unavailable') {
    return new ApiError(
      error.status,
      error.code,
      OPENCLAW_UNAVAILABLE,
      error.body,
    );
  }
  return error;
}
