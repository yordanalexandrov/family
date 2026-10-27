import {
  type RecipeImportDetail,
  type RecipeImportParams,
  recipeImportDetailSchema,
  recipeImportResponseSchema,
  recipeImportsResponseSchema,
} from '@family/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, JSON_HEADERS } from '../../api/client';
import { POLL_INTERVAL_MS } from '../../lib/ai-requests';

const RECENT_LIMIT = 10;

export const importKeys = {
  all: ['recipe-imports'] as const,
  recent: ['recipe-imports', 'recent'] as const,
  request: (id: string) => ['recipe-imports', 'request', id] as const,
};

/** Последните внасяния, най-новите първи. */
export function useRecentImports() {
  return useQuery({
    queryKey: importKeys.recent,
    queryFn: () =>
      apiFetch(
        `/recipe-imports?limit=${RECENT_LIMIT}`,
        recipeImportsResponseSchema,
      ).then((body) => body.requests),
  });
}

/** Внасяне от снимка: файлът, вече смален (`resizePhoto`); отива като `multipart/form-data`, не като JSON. */
export interface PhotoImport {
  kind: 'photo';
  photo: Blob;
}

export type ImportRequestParams = RecipeImportParams | PhotoImport;

/** Текст и линк като JSON; снимка като формуляр с един файл в полето `photo` (браузърът слага boundary-то). */
function importBody(params: ImportRequestParams): RequestInit {
  if (params.kind === 'photo') {
    const form = new FormData();
    form.append('photo', params.photo, 'photo.jpg');
    return { method: 'POST', body: form };
  }
  return {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(params),
  };
}

/** Ново внасяне → `202` с `pending`; работата тече във фона на api. */
export function useRequestImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: ImportRequestParams) =>
      apiFetch(
        '/recipe-imports',
        recipeImportResponseSchema,
        importBody(params),
      ).then((body) => body.request),
    onSuccess(request, params) {
      queryClient.setQueryData<RecipeImportDetail>(
        importKeys.request(request.id),
        {
          request,
          ...(params.kind === 'text' ? { text: params.text } : {}),
          ingredients: [],
        },
      );
      void queryClient.invalidateQueries({ queryKey: importKeys.recent });
    },
  });
}

/** Внасянето, предложението му и свързаните продукти; пита отново на 3 s, докато е `pending`. */
export function useImport(id: string) {
  return useQuery({
    queryKey: importKeys.request(id),
    queryFn: () => apiFetch(`/recipe-imports/${id}`, recipeImportDetailSchema),
    refetchInterval: (query) =>
      query.state.data?.request.status === 'pending' ? POLL_INTERVAL_MS : false,
  });
}
