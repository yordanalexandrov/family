import {
  type AskCookingQuestionBody,
  type CookingQuestion,
  cookingQuestionResponseSchema,
} from '@family/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiFetch, JSON_HEADERS } from '../../api/client';
import { POLL_INTERVAL_MS, requestErrorFor } from '../../lib/ai-requests';

const questionKey = (id: string) => ['recipes', 'question', id] as const;

/** „Питай“ → `202` с `pending`; агентът отговаря във фона на api. Работи и без действащ човек (kiosk). */
export function useAskCookingQuestion(recipeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (asked: AskCookingQuestionBody) =>
      apiFetch(
        `/recipes/${recipeId}/questions`,
        cookingQuestionResponseSchema,
        {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify(asked),
        },
      )
        .then((body) => body.request)
        .catch((error: unknown) => {
          throw requestErrorFor(error);
        }),
    onSuccess(question) {
      // Пита веднага: отговорът може вече да е готов.
      queryClient.setQueryData(questionKey(question.id), question);
      void queryClient.invalidateQueries({
        queryKey: questionKey(question.id),
      });
    },
  });
}

/** api вече не знае въпроса (404), напр. запомнен на устройството от друга база: питането пак е нов въпрос. */
export function isLostQuestion(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

/** Дали заявката за въпроса с `id` е свършила с `isLostQuestion`. */
export function useIsLostQuestion() {
  const queryClient = useQueryClient();
  return (id: string) =>
    isLostQuestion(queryClient.getQueryState(questionKey(id))?.error);
}

/** Заявката за въпроса с `id`; пита отново на 3 s, докато е `pending`. За `useQueries` на листа. */
export function cookingQuestionQuery(id: string) {
  return {
    queryKey: questionKey(id),
    queryFn: (): Promise<CookingQuestion> =>
      apiFetch(`/recipes/questions/${id}`, cookingQuestionResponseSchema).then(
        (body) => body.request,
      ),
    refetchInterval: (query: { state: { data?: CookingQuestion } }) =>
      query.state.data?.status === 'pending' ? POLL_INTERVAL_MS : false,
  } as const;
}
