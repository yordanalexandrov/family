import {
  type CreateMenuRework,
  createMenuReworkSchema,
  type DateKey,
  type MenuReworkRequest,
  menuReworkResponseSchema,
} from '@family/shared';
import {
  type Query,
  type QueryClient,
  type QueryKey,
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
 * Преработката; пита отново на 3 s, докато е `pending`. Когато видяната `pending` стане `done`, презарежда плана на
 * седмицата (и разговорите под него), списъка за пазаруване и дашборда; при край и последната преработка на седмицата.
 */
export function useRework(id: string | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    ...pollRework(queryClient, reworkKey(id ?? ''), async () => {
      const { rework } = await apiFetch(
        `/menu/reworks/${id}`,
        menuReworkResponseSchema,
      );
      if (rework.status !== 'pending') {
        void queryClient.invalidateQueries({
          queryKey: menuKeys.weekRework(rework.weekStart),
        });
      }
      return rework;
    }),
    enabled: id !== undefined,
  });
}

/**
 * Заявка за преработка (`null`: няма такава), която пита отново на 3 s, докато е `pending`, а когато видяната `pending`
 * стане `done`, презарежда менюто на седмицата.
 */
function pollRework<T extends MenuReworkRequest | null>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  read: () => Promise<T>,
) {
  return {
    queryKey,
    queryFn: async (): Promise<T> => {
      const before = queryClient.getQueryData<MenuReworkRequest | null>(
        queryKey,
      );
      const rework = await read();
      if (before?.status === 'pending' && rework?.status === 'done') {
        await reloadReworked(queryClient, rework.weekStart);
      }
      return rework;
    },
    refetchInterval: (query: Query<T, Error, T, QueryKey>) =>
      query.state.data?.status === 'pending' ? POLL_INTERVAL_MS : false,
  };
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
  return useQuery(
    pollRework(
      queryClient,
      menuKeys.weekRework(weekStart),
      async (): Promise<MenuReworkRequest | null> => {
        try {
          const { rework } = await apiFetch(
            `/menu/reworks?${new URLSearchParams({ weekStart })}`,
            menuReworkResponseSchema,
          );
          return rework;
        } catch (error) {
          if (refusalOf(error, 'no_rework')) {
            return null;
          }
          throw error;
        }
      },
    ),
  );
}
