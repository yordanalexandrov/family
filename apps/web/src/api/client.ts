import { readActingUserId } from '../app/acting-user';

const BASE_PATH = '/api';

/** Минимумът от Zod schema, който клиентът ползва; държи web без директна зависимост от zod. */
export interface Schema<T> {
  parse(input: unknown): T;
}

/** Грешка от api във формата на error handler-а му: `{ error: <code>, message }`. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

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
  const body: unknown = await response.json().catch(() => null);
  const code = readString(body, 'error') ?? 'http_error';
  const message =
    readString(body, 'message') ??
    `Сървърът отговори с грешка ${response.status}`;
  return new ApiError(response.status, code, message);
}

function readString(body: unknown, key: string): string | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }
  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}
