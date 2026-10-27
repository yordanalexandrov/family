import { mealReplaceResponseSchema } from '@family/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../api/client';
import { POLL_INTERVAL_MS, requestErrorFor } from '../../lib/ai-requests';

const replacementKey = (id: string) => ['menu', 'replacement', id] as const;

/** „✨ Предложи друго“ → `202` с `pending`; агентът търси във фона на api. */
export function useRequestReplacement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mealId: string) =>
      apiFetch(
        `/menu/meals/${mealId}/replacements`,
        mealReplaceResponseSchema,
        {
          method: 'POST',
        },
      )
        .then((body) => body.replacement)
        .catch((error: unknown) => {
          throw requestErrorFor(error);
        }),
    onSuccess(replacement) {
      queryClient.setQueryData(replacementKey(replacement.id), replacement);
    },
  });
}

/** Заявката за друго ястие; пита отново на 3 s, докато е `pending`. */
export function useReplacement(id: string | undefined) {
  return useQuery({
    queryKey: replacementKey(id ?? ''),
    queryFn: () =>
      apiFetch(`/menu/replacements/${id}`, mealReplaceResponseSchema).then(
        (body) => body.replacement,
      ),
    enabled: id !== undefined,
    refetchInterval: (query) =>
      query.state.data?.status === 'pending' ? POLL_INTERVAL_MS : false,
  });
}
