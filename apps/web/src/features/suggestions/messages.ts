import {
  type Slot,
  type SuggestionRequest,
  type SuggestionRequestStatus,
  TAG_LABELS_BG,
} from '@family/shared';
import { ApiError } from '../../api/client';

/** „Закуска“, „Обяд“, „Вечеря“: етикетът на тага с главна буква. */
export function slotLabel(slot: Slot): string {
  const label = TAG_LABELS_BG[slot];
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export const REQUEST_STATUS_LABELS: Record<SuggestionRequestStatus, string> = {
  pending: 'чака',
  done: 'готова',
  failed: 'неуспешна',
};

const OPENCLAW_UNAVAILABLE = 'AI не е наличен в момента';

const FAILURE_MESSAGES: Record<string, string> = {
  timeout: 'Не успях навреме, опитай пак',
  invalid_output: 'Получих нечетим отговор',
  openclaw_unavailable: OPENCLAW_UNAVAILABLE,
  stale: 'Сървърът се рестартира, докато търсех. Опитай пак',
  aborted: 'Търсенето беше прекъснато. Опитай пак',
  error: 'Нещо се обърка, опитай пак',
};

/** Съобщение по кода на неуспешна заявка (`request.error`). */
export function failureMessage(error: string | undefined): string {
  if (error !== undefined) {
    const known = FAILURE_MESSAGES[error];
    if (known) {
      return known;
    }
    const http = /^http_(\d{3})$/.exec(error);
    if (http) {
      return `AI отговори с грешка ${http[1]}, опитай пак`;
    }
  }
  return 'Нещо се обърка, опитай пак';
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

/** Входът на заявката, за „Опитай пак“ със същите параметри. */
export function paramsOf(request: SuggestionRequest) {
  return {
    slot: request.slot,
    ...(request.maxMinutes === undefined
      ? {}
      : { maxMinutes: request.maxMinutes }),
    ...(request.tags.length > 0 ? { tags: request.tags } : {}),
    ...(request.hint === undefined ? {} : { hint: request.hint }),
  };
}

const dateFormat = new Intl.DateTimeFormat('bg-BG', {
  dateStyle: 'short',
  timeStyle: 'short',
});

export function formatDateTime(iso: string): string {
  return dateFormat.format(new Date(iso));
}

/** „recepti.example“ от линка на източника. */
export function sourceDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** „1 продукт“, „3 продукта“. */
export function productCount(count: number): string {
  return count === 1 ? '1 продукт' : `${count} продукта`;
}
