import { meResponseSchema } from '@family/shared';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiError, dani, server } from '../test/msw';
import { setUpDevice } from '../test/render';
import { ApiError, apiFetch } from './client';

describe('apiFetch', () => {
  it('на телефон слага X-Acting-User от localStorage', async () => {
    setUpDevice('phone', dani.id);

    const result = await apiFetch('/me', meResponseSchema);

    expect(result.user.name).toBe('Дани');
  });

  it.each(['kiosk', 'tv'] as const)(
    'в режим %s не праща X-Acting-User, дори да е останал записан',
    async (mode) => {
      setUpDevice(mode, dani.id);

      const error = await apiFetch('/me', meResponseSchema).catch((e) => e);

      expect(error).toMatchObject({ status: 400, code: 'missing_acting_user' });
    },
  );

  it('без действащ потребител не праща хедъра и получава 400 от api', async () => {
    const error = await apiFetch('/me', meResponseSchema).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: 'missing_acting_user' });
  });

  it('хвърля ApiError със status, code и message при не-2xx', async () => {
    server.use(
      http.get('/api/me', () =>
        apiError(401, 'missing_access_token', 'Липсва Access токен'),
      ),
    );

    const error = await apiFetch('/me', meResponseSchema).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 401,
      code: 'missing_access_token',
      message: 'Липсва Access токен',
    });
  });

  it('пази суровото тяло на грешката за полета извън `{ error, message }`', async () => {
    server.use(
      http.get('/api/me', () =>
        HttpResponse.json(
          { error: 'conflict', message: 'Вече има', ingredient: { id: 'x' } },
          { status: 409 },
        ),
      ),
    );

    const error = await apiFetch('/me', meResponseSchema).catch((e) => e);

    expect(error).toMatchObject({ status: 409, code: 'conflict' });
    expect(error.body).toEqual({
      error: 'conflict',
      message: 'Вече има',
      ingredient: { id: 'x' },
    });
  });

  it.each([
    [
      'с код извън договора на api',
      () =>
        HttpResponse.json(
          {
            error: 'FST_ERR_CTP_INVALID_MEDIA_TYPE',
            message: 'Unsupported Media Type',
          },
          { status: 415 },
        ),
      { status: 415, message: 'Сървърът отговори с грешка 415' },
    ],
    [
      'което не е JSON (страница от proxy-то)',
      () =>
        new HttpResponse('<h1>502 Bad Gateway</h1>', {
          status: 502,
          headers: { 'Content-Type': 'text/html' },
        }),
      { status: 502, message: 'Сървърът отговори с грешка 502' },
    ],
  ])(
    'при тяло %s хвърля ApiError http_error с българско съобщение',
    async (_case, reply, expected) => {
      server.use(http.get('/api/me', reply));

      const error = await apiFetch('/me', meResponseSchema).catch((e) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ ...expected, code: 'http_error' });
    },
  );
});

describe('apiFetch schema', () => {
  it('парсва отговора със schema и хвърля ApiError при невалидно тяло', async () => {
    server.use(
      http.get('/api/me', () => HttpResponse.json({ user: { id: 'nope' } })),
    );

    const error = await apiFetch('/me', meResponseSchema).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 200, code: 'invalid_response' });
    expect(error.message).toBe('Неочакван отговор от сървъра');
  });
});
