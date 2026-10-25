import { meResponseSchema } from '@family/shared';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiError, dani, server } from '../test/msw';
import { ApiError, apiFetch } from './client';

describe('apiFetch', () => {
  it('слага X-Acting-User от localStorage', async () => {
    localStorage.setItem('family.actingUserId', dani.id);

    const result = await apiFetch('/me', meResponseSchema);

    expect(result.user.name).toBe('Дани');
  });

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
