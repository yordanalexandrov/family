import {
  type RecipeRevisionRequest,
  type RevisionLine,
  recipeRevisionResponseSchema,
} from '@family/shared';
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiFetch, JSON_HEADERS } from '../../api/client';
import { POLL_INTERVAL_MS, requestErrorFor } from '../../lib/ai-requests';
import { recipeKeys } from './queries';
import {
  emptyIngredientRow,
  type IngredientRowValues,
} from './recipe-form-values';

const revisionKey = (id: string) => ['recipes', 'revision', id] as const;

/** „Поправка чака преглед“ в регистъра и в изгледа се сменя: рецептите се презареждат, поправките не. */
function refreshOpenRevision(queryClient: QueryClient) {
  void queryClient.invalidateQueries({
    queryKey: recipeKeys.all,
    predicate: (query) => query.queryKey[1] !== 'revision',
  });
}

/** „Изпрати“ в „✏️ Поправи с AI“ → `202` с `pending`; агентът работи във фона на api. */
export function useRequestRevision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      recipeId,
      instruction,
    }: {
      recipeId: string;
      instruction: string;
    }) =>
      apiFetch(`/recipes/${recipeId}/revisions`, recipeRevisionResponseSchema, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ instruction }),
      })
        .then((body) => body.request)
        .catch((error: unknown) => {
          throw requestErrorFor(error);
        }),
    onSuccess(request) {
      // Веднага пита отново: заявката може вече да е свършила.
      void queryClient.invalidateQueries({ queryKey: revisionKey(request.id) });
      refreshOpenRevision(queryClient);
    },
  });
}

/** Поправката с `id`; пита отново на 3 s, докато е `pending`. Без `id` не пита. */
export function useRevision(id: string | undefined) {
  return useQuery({
    queryKey: revisionKey(id ?? ''),
    queryFn: (): Promise<RecipeRevisionRequest> =>
      apiFetch(`/recipes/revisions/${id}`, recipeRevisionResponseSchema).then(
        (body) => body.request,
      ),
    enabled: id !== undefined,
    refetchInterval: (query) =>
      query.state.data?.status === 'pending' ? POLL_INTERVAL_MS : false,
  });
}

/** „Отхвърли“: поправката е решена и не чака повече. */
export function useRejectRevision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(
        `/recipes/revisions/${id}/reject`,
        recipeRevisionResponseSchema,
        { method: 'POST' },
      ).then((body) => body.request),
    onSuccess(request) {
      queryClient.setQueryData(revisionKey(request.id), request);
      refreshOpenRevision(queryClient);
    },
  });
}

/**
 * Продуктите на поправката като редове на формата: свързаните с продукта си, а предложеният нов продукт неразрешен, с
 * името си и попълнена форма „Нов продукт“, както при внасяне.
 */
export function revisionToIngredientRows(
  lines: readonly RevisionLine[],
): IngredientRowValues[] {
  return lines.map((line) =>
    emptyIngredientRow({
      ingredient: line.ingredient ?? null,
      query: line.ingredient?.name ?? line.newProduct?.name ?? '',
      quantity: line.quantity === null ? '' : String(line.quantity),
      unit: line.unit,
      ...(line.note === undefined ? {} : { note: line.note }),
      ...(line.newProduct ? { isNew: true, newProduct: line.newProduct } : {}),
    }),
  );
}
