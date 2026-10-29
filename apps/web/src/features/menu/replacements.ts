import {
  isMovedLine,
  type MealComment,
  type MealReplaceRequest,
  mealReplaceResponseSchema,
} from '@family/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, refusalOf } from '../../api/client';
import { POLL_INTERVAL_MS, requestErrorFor } from '../../lib/ai-requests';

/** Последната заявка на ястието: пазена извън листа, за да я намери и отвореният пак лист. */
const latestReplacementKey = (mealId: string) =>
  ['menu', 'meal-replacement', mealId] as const;

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
      queryClient.setQueryData(
        latestReplacementKey(replacement.mealId),
        replacement,
      );
    },
  });
}

/**
 * Последната заявка за друго ястие (на когото и да е) или `null` (api връща 404 `no_replacement`); пита отново на 3 s,
 * докато е `pending`.
 */
export function useLatestReplacement(mealId: string) {
  return useQuery({
    queryKey: latestReplacementKey(mealId),
    queryFn: async (): Promise<MealReplaceRequest | null> => {
      try {
        const body = await apiFetch(
          `/menu/meals/${mealId}/replacements`,
          mealReplaceResponseSchema,
        );
        return body.replacement;
      } catch (error) {
        if (refusalOf(error, 'no_replacement')) {
          return null;
        }
        throw error;
      }
    },
    refetchInterval: (query) =>
      query.state.data?.status === 'pending' ? POLL_INTERVAL_MS : false,
  });
}

/**
 * Ястието е сменено след заявката: в разговора има системен ред за смяна на рецептата или бележката, писан след като
 * тя е поискана. Тогава кандидатите ѝ вече не са за това ястие. Преместването на друг ден не ги прави чужди.
 */
export function changedSince(
  request: MealReplaceRequest,
  thread: readonly MealComment[],
): boolean {
  const asked = Date.parse(request.createdAt);
  return thread.some(
    (line) =>
      line.kind === 'system' &&
      !isMovedLine(line.body) &&
      Date.parse(line.createdAt) > asked,
  );
}
