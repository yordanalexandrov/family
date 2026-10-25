import {
  type ApiErrorCode,
  apiErrorCodeSchema,
  apiErrorSchema,
} from '@family/shared';
import { readActingUserId } from '../app/acting-user';

const BASE_PATH = '/api';

/** Минимумът от Zod schema, който клиентът ползва; държи web без директна зависимост от zod. */
export interface Schema<T> {
  parse(input: unknown): T;
}

/**
 * Кодове на самия клиент, когато отговорът не е по договора на api: `http_error` — грешка, чието тяло
 * не е по `apiErrorSchema` (напр. 502 от proxy-то); `invalid_response` — 2xx с тяло извън schema-та на route-а.
 */
type ClientErrorCode = 'http_error' | 'invalid_response';

/** Грешка от api по `apiErrorSchema` в shared (`{ error: <code>, message }`) или от самия клиент. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | ClientErrorCode;
  /** Суровото тяло на отговора, за грешки с повече от `{ error, message }` (напр. 409 с `ingredient`). */
  readonly body: unknown;

  constructor(
    status: number,
    code: ApiErrorCode | ClientErrorCode,
    message: string,
    body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }

  /** 401/403: Cloudflare Access сесията е изтекла; презареждането води до PIN екрана. */
  isSessionExpired(): boolean {
    return this.status === 401 || this.status === 403;
  }

  /** Избраният на устройството потребител вече не съществува в api (напр. изтрит). */
  isUnknownActingUser(): boolean {
    return this.code === apiErrorCodeSchema.enum.unknown_acting_user;
  }

  /** 5xx: сървърът или пътят до него не успя и същата заявка може да мине след малко; 4xx няма да мине. */
  isServerError(): boolean {
    return this.status >= 500;
  }
}

/** Headers of a request with a JSON body. */
export const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function apiFetch<T>(
  path: string,
  schema: Schema<T>,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  const actingUserId = readActingUserId();
  if (actingUserId) {
    headers.set('X-Acting-User', actingUserId);
  }

  const url = new URL(`${BASE_PATH}${path}`, window.location.href);
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    throw await toApiError(response);
  }
  const body: unknown = await response.json().catch(() => undefined);
  try {
    return schema.parse(body);
  } catch {
    throw new ApiError(
      response.status,
      'invalid_response',
      'Неочакван отговор от сървъра',
    );
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  const raw: unknown = await response.json().catch(() => undefined);
  const body = apiErrorSchema.safeParse(raw);
  if (body.success) {
    return new ApiError(
      response.status,
      body.data.error,
      body.data.message,
      raw,
    );
  }
  return new ApiError(
    response.status,
    'http_error',
    `Сървърът отговори с грешка ${response.status}`,
    raw,
  );
}
