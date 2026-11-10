import {
  type CreateMenuRework,
  createMenuReworkSchema,
  type DateKey,
  type MenuReworkRequest,
  menuReworkResponseSchema,
} from '@family/shared';
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiFetch, JSON_HEADERS, refusalOf } from '../../api/client';
import { queryKeys } from '../../api/queries';
import { POLL_INTERVAL_MS, requestErrorFor } from '../../lib/ai-requests';
import { shoppingKeys } from '../shopping/queries';
import { menuKeys } from './queries';

/** Една преработка по `id`: не е под плана, който тя презарежда. */
export const reworkKey = (id: string) => ['menu', 'rework', id] as const;

/** „✨ Преработи менюто“ → `202` с `pending`; агентът работи във фона на api. */
export function useRequestRework() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMenuRework) =>
      apiFetch('/menu/reworks', menuReworkResponseSchema, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(createMenuReworkSchema.parse(input)),
      })
        .then((body) => body.rework)
        .catch((error: unknown) => {
          throw requestErrorFor(error);
        }),
    onSuccess(rework) {
      queryClient.setQueryData(reworkKey(rework.id), rework);
      queryClient.setQueryData(menuKeys.weekRework(rework.weekStart), rework);
    },
  });
}

/**
 * Преработката; пита отново на 3 s, докато е `pending`. При `done` презарежда плана на седмицата (и разговорите под
 * него), списъка за пазаруване и дашборда.
 */
export function useRework(id: string | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: reworkKey(id ?? ''),
    queryFn: async () => {
      const { rework } = await apiFetch(
        `/menu/reworks/${id}`,
        menuReworkResponseSchema,
      );
      if (rework.status !== 'pending') {
        void queryClient.invalidateQueries({
          queryKey: menuKeys.weekRework(rework.weekStart),
        });
      }
      if (rework.status === 'done') {
        await reloadReworked(queryClient, rework.weekStart);
      }
      return rework;
    },
    enabled: id !== undefined,
    refetchInterval: (query) =>
      query.state.data?.status === 'pending' ? POLL_INTERVAL_MS : false,
  });
}

/** Менюто на седмицата след преработка: планът (с разговорите под него), списъкът за пазаруване и дашбордът. */
async function reloadReworked(queryClient: QueryClient, weekStart: DateKey) {
  await queryClient.invalidateQueries({ queryKey: menuKeys.plan(weekStart) });
  void queryClient.invalidateQueries({
    queryKey: shoppingKeys.list(weekStart),
  });
  void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
}

/**
 * Последната преработка на седмицата или `null` (api връща 404 `no_rework`), на всяко устройство: докато е `pending`,
 * менюто е заключено. Пита отново на 3 s, докато е `pending` (сигналът `menu.rework.changed` идва по-рано), а
 * когато видяната `pending` стане `done`, презарежда менюто.
 */
export function useWeekRework(weekStart: DateKey) {
  const queryClient = useQueryClient();
  const queryKey = menuKeys.weekRework(weekStart);
  return useQuery({
    queryKey,
    queryFn: async (): Promise<MenuReworkRequest | null> => {
      const before = queryClient.getQueryData<MenuReworkRequest | null>(
        queryKey,
      );
      let rework: MenuReworkRequest;
      try {
        ({ rework } = await apiFetch(
          `/menu/reworks?${new URLSearchParams({ weekStart })}`,
          menuReworkResponseSchema,
        ));
      } catch (error) {
        if (refusalOf(error, 'no_rework')) {
          return null;
        }
        throw error;
      }
      if (before?.status === 'pending' && rework.status === 'done') {
        await reloadReworked(queryClient, weekStart);
      }
      return rework;
    },
    refetchInterval: (query) =>
      query.state.data?.status === 'pending' ? POLL_INTERVAL_MS : false,
  });
}
