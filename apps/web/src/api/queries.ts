import {
  calendarEventsResponseSchema,
  type DateKey,
  dashboardResponseSchema,
  meResponseSchema,
  type SyncSource,
  syncRunResultSchema,
  usersResponseSchema,
} from '@family/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useActingUser } from '../app/acting-user';
import { offlineCache } from '../lib/offline-cache';
import { apiFetch, isConnectionError } from './client';

export const queryKeys = {
  users: ['users'] as const,
  me: (actingUserId: string | null) => ['me', actingUserId] as const,
  dashboard: ['dashboard'] as const,
  calendarEvents: (from: DateKey, to: DateKey) =>
    ['calendar-events', from, to] as const,
};

export function fetchMe() {
  return apiFetch('/me', meResponseSchema);
}

/** Последните хора от api-то: без връзка аватарите (кой какво е отметнал) идват от тук. */
const usersCache = offlineCache('family.users', usersResponseSchema, 'хората');

/** Хората от api-то, а без връзка последните записани; без запис грешката остава. */
async function fetchUsers() {
  try {
    const body = await apiFetch('/users', usersResponseSchema);
    usersCache.write(body, new Date());
    return body.users;
  } catch (error) {
    const cached = isConnectionError(error) ? usersCache.read() : null;
    if (!cached) {
      throw error;
    }
    return cached.data.users;
  }
}

/** Хората; пазят се в кеша като списъка за пазаруване, затова се виждат и без връзка. */
export function useUsers() {
  return useQuery({
    queryKey: queryKeys.users,
    queryFn: fetchUsers,
    // Без връзка заявката пак тръгва и чете кеша, вместо да чака.
    networkMode: 'always',
  });
}

export function useMe() {
  const { actingUserId } = useActingUser();
  return useQuery({
    queryKey: queryKeys.me(actingUserId),
    queryFn: fetchMe,
    enabled: actingUserId !== null,
  });
}

/** `GET /api/dashboard`: всяка минута; api сам синхронизира източниците. */
export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => apiFetch('/dashboard', dashboardResponseSchema),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/** `GET /api/calendar/events`: дните от `from` до `to` (без него). */
export function useCalendarEvents(from: DateKey, to: DateKey) {
  return useQuery({
    queryKey: queryKeys.calendarEvents(from, to),
    queryFn: () =>
      apiFetch(
        `/calendar/events?${new URLSearchParams({ from, to })}`,
        calendarEventsResponseSchema,
      ).then((body) => body.days),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/** Ръчна синхронизация (`POST /api/sync/:source`, с действащ потребител); после данните се презареждат. */
export function useSync(source: SyncSource) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch(`/sync/${source}`, syncRunResultSchema, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      if (source === 'calendar') {
        void queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      }
    },
  });
}
