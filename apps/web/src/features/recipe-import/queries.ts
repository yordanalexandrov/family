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
  /** Не е под `all`: invalidate на внасянията не бива да изтрие снимката (няма от къде да се вземе наново). */
  photo: (id: string) => ['recipe-import-photo', id] as const,
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
 * Внасяне от снимка: файлът, вече смален (`resizePhoto`) — една снимка или частите на дълъг скрийншот отгоре надолу;
 * отива като `multipart/form-data`, не като JSON.
 */
export interface PhotoImport {
  kind: 'photo';
  photos: Blob[];
}

export type ImportRequestParams = RecipeImportParams | PhotoImport;

/** Текст и линк като JSON; снимка като формуляр с файл за всяка част в полето `photo` (браузърът слага boundary-то). */
function importBody(params: ImportRequestParams): RequestInit {
  if (params.kind === 'photo') {
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

/**
 * Първата снимка на внасяне от снимка, пуснато от този прозорец: за миниатюрата под изчакването и грешката. Само в
 * кеша на заявките (api-то не пази снимката), затова след презареждане я няма (`null`).
 */
export function useSentPhoto(id: string): Blob | undefined {
  const photo = useQuery({
    queryKey: importKeys.photo(id),
    queryFn: () => null as Blob | null,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });
  return photo.data ?? undefined;
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
      if (params.kind === 'photo' && params.photos[0]) {
        queryClient.setQueryData(
          importKeys.photo(request.id),
          params.photos[0],
        );
      }
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
