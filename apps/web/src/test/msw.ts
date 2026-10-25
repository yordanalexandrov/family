import type { User } from '@family/shared';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';

// Фикстури по seed-а на api (#16): Дани и Поли.
export const dani: User = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Дани',
  role: 'parent',
  initial: 'Д',
  color: 'person-1',
};

export const poli: User = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Поли',
  role: 'parent',
  initial: 'П',
  color: 'person-2',
};

export const users = [dani, poli];

export const accessEmail = 'parent@example.com';

export function apiError(status: number, error: string, message: string) {
  return HttpResponse.json({ error, message }, { status });
}

export const handlers = [
  http.get('/api/users', () => HttpResponse.json({ users })),
  http.get('/api/me', ({ request }) => {
    const id = request.headers.get('x-acting-user');
    if (!id) {
      return apiError(400, 'missing_acting_user', 'Липсва действащ потребител');
    }
    const user = users.find((u) => u.id === id);
    if (!user) {
      return apiError(400, 'unknown_acting_user', 'Непознат потребител');
    }
    return HttpResponse.json({ user, accessEmail });
  }),
];

export const server = setupServer(...handlers);
