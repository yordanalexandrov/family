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

/**
 * Внасяне от нова снимка: файлът, вече смален (`resizePhoto`) — една снимка или частите на дълъг скрийншот отгоре
 * надолу; отива като `multipart/form-data`, не като JSON. Записаните снимки на внасяне (по id) са `kind: 'photo'`.
 */
export interface PhotoImport {
  kind: 'upload';
  photos: Blob[];
}

export type ImportRequestParams = RecipeImportParams | PhotoImport;

/**
 * Текст, линк и записаните снимки като JSON; нова снимка като формуляр с файл за всяка част в полето `photo`
 * (браузърът слага boundary-то).
 */
function importBody(params: ImportRequestParams): RequestInit {
  if (params.kind === 'upload') {
    const form = new FormData();
    for (const photo of params.photos) {
      form.append('photo', photo, 'photo.jpg');
    }
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
      // Id-тата на новите снимки идват само от GET: без тях не се попълва, а GET тръгва веднага.
      if (params.kind !== 'upload') {
        queryClient.setQueryData<RecipeImportDetail>(
          importKeys.request(request.id),
          {
            request,
            ...(params.kind === 'text' ? { text: params.text } : {}),
            ...(params.kind === 'photo' ? { photos: params.photos } : {}),
            ingredients: [],
          },
        );
      }
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
