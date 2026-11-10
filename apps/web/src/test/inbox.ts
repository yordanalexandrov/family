import type { InboxItem } from '@family/shared';
import { HttpResponse, http } from 'msw';
import { dani, server } from './msw';

let nextId = 0;

/** Запис от Входящата кутия; по подразбиране непрочетено „Извади месото за утре“ в 20:00 на 4 ноември 2026. */
export function inboxItem(overrides: Partial<InboxItem> = {}): InboxItem {
  nextId += 1;
  return {
    id: `eeeeeeee-0000-4000-8000-${String(nextId).padStart(12, '0')}`,
    kind: 'thaw',
    title: 'Извади месото за утре',
    body: 'Мусака: смесена кайма, свински врат',
    url: '/menu?week=2026-11-02&meal=aaaaaaaa-0000-4000-8000-000000000001',
    createdAt: '2026-11-04T18:00:00.000Z',
    updatedAt: '2026-11-04T18:00:00.000Z',
    unread: true,
    ...overrides,
  };
}

/**
 * `/api/inbox*` като в api: записите на `owner` (Дани по подразбиране), другият вижда празна кутия. Прочитането мени
 * състоянието; `reads` са id-тата от `POST /api/inbox/:id/read`, `readAll` — колко пъти е натиснато „Всички прочетени“.
 */
export function serveInbox(initial: InboxItem[], owner = dani.id) {
  let items = structuredClone(initial);
  const state = { reads: [] as string[], readAll: 0 };
  const mine = (request: Request) =>
    request.headers.get('x-acting-user') === owner ? items : [];
  server.use(
    http.get('/api/inbox', ({ request }) =>
      HttpResponse.json({ items: mine(request) }),
    ),
    http.get('/api/inbox/unread-count', ({ request }) =>
      HttpResponse.json({
        unread: mine(request).filter((item) => item.unread).length,
      }),
    ),
    http.post('/api/inbox/read-all', () => {
      state.readAll += 1;
      items = items.map((item) => ({ ...item, unread: false }));
      return new HttpResponse(null, { status: 204 });
    }),
    http.post<{ id: string }>('/api/inbox/:id/read', ({ params }) => {
      state.reads.push(params.id);
      items = items.map((item) =>
        item.id === params.id ? { ...item, unread: false } : item,
      );
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return state;
}
