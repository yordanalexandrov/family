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
import { apiFetch } from './client';

export const queryKeys = {
  users: ['users'] as const,
  me: (actingUserId: string | null) => ['me', actingUserId] as const,
  dashboard: ['dashboard'] as const,
  calendarEvents: (from: DateKey, to: DateKey) =>
    ['calendar-events', from, to] as const,
};

export function fetchUsers() {
  return apiFetch('/users', usersResponseSchema).then((body) => body.users);
}

export function fetchMe() {
  return apiFetch('/me', meResponseSchema);
}

export function useUsers() {
  return useQuery({ queryKey: queryKeys.users, queryFn: fetchUsers });
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
