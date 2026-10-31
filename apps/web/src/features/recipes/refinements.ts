import {
  type RecipeRefineRequest,
  recipeRefineResponseSchema,
} from '@family/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../api/client';
import { POLL_INTERVAL_MS, requestErrorFor } from '../../lib/ai-requests';

const refinementKey = (id: string) => ['recipes', 'refinement', id] as const;

/** „✨ Подобри рецептата“ → `202` с `pending`; агентът работи във фона на api. */
export function useRequestRefinement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (recipeId: string) =>
      apiFetch(`/recipes/${recipeId}/refinements`, recipeRefineResponseSchema, {
        method: 'POST',
      })
        .then((body) => body.request)
        .catch((error: unknown) => {
          throw requestErrorFor(error);
        }),
    onSuccess(request) {
      // Веднага пита отново: заявката може вече да е свършила.
      void queryClient.invalidateQueries({
        queryKey: refinementKey(request.id),
      });
    },
  });
}

/** Подобряването с `id`; пита отново на 3 s, докато е `pending`. Без `id` не пита. */
export function useRefinement(id: string | undefined) {
  return useQuery({
    queryKey: refinementKey(id ?? ''),
    queryFn: (): Promise<RecipeRefineRequest> =>
      apiFetch(`/recipes/refinements/${id}`, recipeRefineResponseSchema).then(
        (body) => body.request,
      ),
    enabled: id !== undefined,
    refetchInterval: (query) =>
      query.state.data?.status === 'pending' ? POLL_INTERVAL_MS : false,
  });
}
