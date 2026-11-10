import {
  type CreateMenuRework,
  createMenuReworkSchema,
  menuReworkResponseSchema,
} from '@family/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, JSON_HEADERS } from '../../api/client';
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
      if (rework.status === 'done') {
        await queryClient.invalidateQueries({
          queryKey: menuKeys.plan(rework.weekStart),
        });
        void queryClient.invalidateQueries({
          queryKey: shoppingKeys.list(rework.weekStart),
        });
        void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      }
      return rework;
    },
    enabled: id !== undefined,
    refetchInterval: (query) =>
      query.state.data?.status === 'pending' ? POLL_INTERVAL_MS : false,
  });
}
