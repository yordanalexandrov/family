import {
  approvedSuggestionResponseSchema,
  type RecipeInput,
  type RecipeSuggestParams,
  recipeSuggestionResponseSchema,
  type SuggestionRequestDetail,
  suggestionRequestDetailSchema,
  suggestionRequestResponseSchema,
  suggestionRequestsResponseSchema,
} from '@family/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../api/client';
import { recipeKeys } from '../recipes/queries';

/** Докато заявката е `pending`, клиентът пита на 3 s (епик Рецепти: „Фон“). */
export const POLL_INTERVAL_MS = 3000;

const RECENT_LIMIT = 10;

export const suggestionKeys = {
  all: ['recipe-suggestions'] as const,
  recent: ['recipe-suggestions', 'recent'] as const,
  request: (id: string) => ['recipe-suggestions', 'request', id] as const,
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };

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
      queryClient.setQueryData(recipeKeys.detail(recipe.id), recipe);
      void queryClient.invalidateQueries({
        queryKey: [...recipeKeys.all, 'list'],
      });
      void queryClient.invalidateQueries({
        queryKey: suggestionKeys.request(suggestion.requestId),
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
        queryKey: suggestionKeys.request(suggestion.requestId),
      });
    },
  });
}
