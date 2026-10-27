import {
  type AnyRecipeSuggestion,
  approvedSuggestionResponseSchema,
  type RecipeInput,
  type RecipeSuggestParams,
  recipeSuggestionResponseSchema,
  type SuggestionRequest,
  type SuggestionRequestDetail,
  suggestionRequestDetailSchema,
  suggestionRequestResponseSchema,
  suggestionRequestsResponseSchema,
} from '@family/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, JSON_HEADERS } from '../../api/client';
import { POLL_INTERVAL_MS } from '../../lib/ai-requests';
import { importKeys } from '../recipe-import/queries';
import { storeRecipe } from '../recipes/queries';

const RECENT_LIMIT = 10;

export const suggestionKeys = {
  all: ['recipe-suggestions'] as const,
  recent: ['recipe-suggestions', 'recent'] as const,
  request: (id: string) => ['recipe-suggestions', 'request', id] as const,
};

/** Входът на заявката, за „Опитай пак“ със същите параметри. */
export function paramsOf(request: SuggestionRequest) {
  return {
    slots: request.slots,
    ...(request.times.length > 0 ? { times: request.times } : {}),
    ...(request.tags.length > 0 ? { tags: request.tags } : {}),
    ...(request.hint === undefined ? {} : { hint: request.hint }),
  };
}

/** Последните заявки, най-новите първи. */
export function useRecentRequests() {
  return useQuery({
    queryKey: suggestionKeys.recent,
    queryFn: () =>
      apiFetch(
        `/recipe-suggestions/requests?limit=${RECENT_LIMIT}`,
        suggestionRequestsResponseSchema,
      ).then((body) => body.requests),
  });
}

/** Нова заявка → `202` с `pending`; работата тече във фона на api. */
export function useRequestSuggestions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: RecipeSuggestParams) =>
      apiFetch(
        '/recipe-suggestions/requests',
        suggestionRequestResponseSchema,
        {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify(params),
        },
      ).then((body) => body.request),
    onSuccess(request) {
      queryClient.setQueryData<SuggestionRequestDetail>(
        suggestionKeys.request(request.id),
        { request, suggestions: [] },
      );
      void queryClient.invalidateQueries({ queryKey: suggestionKeys.recent });
    },
  });
}

/** Заявката и предложенията ѝ; пита отново на 3 s, докато е `pending`. */
export function useSuggestionRequest(id: string) {
  return useQuery({
    queryKey: suggestionKeys.request(id),
    queryFn: () =>
      apiFetch(
        `/recipe-suggestions/requests/${id}`,
        suggestionRequestDetailSchema,
      ),
    refetchInterval: (query) =>
      query.state.data?.request.status === 'pending' ? POLL_INTERVAL_MS : false,
  });
}

/** Заявката, от която е предложението: заявка за предложения или внасяне; пита се наново след решение. */
function requestKeyOf(suggestion: AnyRecipeSuggestion) {
  return suggestion.origin === 'import'
    ? importKeys.all
    : suggestionKeys.request(suggestion.requestId);
}

/** Одобрение с редактирания `recipeInput` → нова рецепта в регистъра. */
export function useApproveSuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RecipeInput }) =>
      apiFetch(
        `/recipe-suggestions/${id}/approve`,
        approvedSuggestionResponseSchema,
        {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify(input),
        },
      ),
    onSuccess({ recipe, suggestion }) {
      storeRecipe(queryClient, recipe);
      void queryClient.invalidateQueries({
        queryKey: requestKeyOf(suggestion),
      });
    },
  });
}

export function useRejectSuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(
        `/recipe-suggestions/${id}/reject`,
        recipeSuggestionResponseSchema,
        { method: 'POST' },
      ).then((body) => body.suggestion),
    onSuccess(suggestion) {
      void queryClient.invalidateQueries({
        queryKey: requestKeyOf(suggestion),
      });
    },
  });
}
