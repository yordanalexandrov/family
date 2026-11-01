import {
  type AskCookingQuestionBody,
  type CookingQuestion,
  cookingQuestionResponseSchema,
} from '@family/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiFetch, JSON_HEADERS, refusalOf } from '../../api/client';
import { POLL_INTERVAL_MS, requestErrorFor } from '../../lib/ai-requests';

const questionKey = (id: string) => ['recipes', 'question', id] as const;

function postQuestion(recipeId: string, asked: AskCookingQuestionBody) {
  return apiFetch(
    `/recipes/${recipeId}/questions`,
    cookingQuestionResponseSchema,
    { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(asked) },
  ).then((body) => body.request);
}

/**
 * Пита; ако api не знае `follows` или някой от `applied` (напр. изгубени, след като заявката им е изчезнала от
 * кеша), пита още веднъж без тях: без `follows` въпросът започва нова верига. Всеки опит праща по-малко, затова
 * опитите свършват.
 */
async function postKnown(
  recipeId: string,
  asked: AskCookingQuestionBody,
): Promise<CookingQuestion> {
  try {
    return await postQuestion(recipeId, asked);
  } catch (error) {
    const { follows, applied = [], ...rest } = asked;
    const unknownApplied = refusalOf(error, 'no_applied_change')?.ids;
    if (unknownApplied) {
      const known = applied.filter((id) => !unknownApplied.includes(id));
      if (known.length < applied.length) {
        return postKnown(recipeId, {
          ...rest,
          ...(follows ? { follows } : {}),
          ...(known.length > 0 ? { applied: known } : {}),
        });
      }
    }
    if (follows && refusalOf(error, 'no_earlier_question')) {
      return postKnown(recipeId, {
        ...rest,
        ...(applied.length > 0 ? { applied } : {}),
      });
    }
    throw error;
  }
}

/** „Питай“ → `202` с `pending`; агентът отговаря във фона на api. Работи и без действащ човек (kiosk). */
export function useAskCookingQuestion(recipeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (asked: AskCookingQuestionBody) =>
      postKnown(recipeId, asked).catch((error: unknown) => {
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
