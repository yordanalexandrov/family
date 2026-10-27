import {
  type ApiErrorCode,
  addDays,
  type DashboardResponse,
  type DayEvents,
  dashboardResponseSchema,
  groupEventsByDay,
  type User,
} from '@family/shared';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import dashboardFixture from './fixtures/dashboard.json';

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

/**
 * `GET /api/dashboard` в сряда, 4 ноември 2026, 10:00 в София: 4 дни (покана от двата
 * източника, целодневно, празен ден, многодневно), бюджет в евро, всичко `ok`.
 * Минава през schema-та, за да не се разминава с договора.
 */
export const dashboard: DashboardResponse =
  dashboardResponseSchema.parse(dashboardFixture);

/** Моментът на фикстурата: 10:00 в София. */
export const fixtureNow = new Date(dashboard.now);

/** Копие на фикстурата с подменени полета. */
export function dashboardWith(
  overrides: Partial<DashboardResponse>,
): DashboardResponse {
  return { ...structuredClone(dashboard), ...overrides };
}

/** Тяло по `apiErrorSchema`, както го връща error handler-ът на api. */
export function apiError(status: number, error: ApiErrorCode, message: string) {
  return HttpResponse.json({ error, message }, { status });
}

/** Дните от `from` до `to` (без него), групирани като в api: многодневните са във всеки свой ден. */
function calendarDays(from: string, to: string): DayEvents[] {
  const events = new Map(
    dashboard.days
      .flatMap((day) => day.events)
      .map((event) => [event.id, event]),
  );
  return groupEventsByDay([...events.values()], from, to);
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
  http.get('/api/dashboard', () => HttpResponse.json(dashboard)),
  // Листът на ястието чете разговора; без `serveThreads` той е празен.
  http.get('/api/menu/meals/:id/comments', () =>
    HttpResponse.json({ comments: [] }),
  ),
  // Седмица без `serveWeekProposal` няма предложение (нито ръчно, нито от крона).
  http.get('/api/menu/proposals', () =>
    apiError(404, 'not_found', 'Няма такова предложение за меню'),
  ),
  http.get('/api/calendar/events', ({ request }) => {
    const url = new URL(request.url);
    const from = url.searchParams.get('from') ?? dashboard.today;
    const to = url.searchParams.get('to') ?? addDays(from, 14);
    return HttpResponse.json({ from, to, days: calendarDays(from, to) });
  }),
];

export const server = setupServer(...handlers);
