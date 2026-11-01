import type { AskCookingQuestionBody } from '@family/shared';
import { useState } from 'react';
import { useRememberedQuestions } from './cooking-memory';
import { useAskCookingQuestion, useIsLostQuestion } from './questions';

/**
 * Въпросите в Готвене на една рецепта (GLOSSARY: Въпрос в Готвене), зададени от това устройство: id-тата им по реда на
 * задаване и пускането на нов. Те са една верига: всеки нов продължава (`follows`) последния, а повторният („Опитай
 * пак“) — същия, който продължаваше неуспешният. Изгубен въпрос (404) не се продължава: api не го знае. Държи се в `CookingView`, над листа „Въпрос“, за да продължи чакането, докато листът е
 * затворен. Помнят се на устройството заедно с напредъка в Готвене, до края на деня или до „Готово“.
 */
export function useCookingQuestions(recipeId: string) {
  const remembered = useRememberedQuestions(recipeId);
  const ids = remembered.questions.map(({ id }) => id);
  /** Неуспешният въпрос, чийто „Опитай пак“ се праща в момента. */
  const [replacing, setReplacing] = useState<string>();
  const start = useAskCookingQuestion(recipeId);
  const isLost = useIsLostQuestion();
  return {
    ids,
    /** Зададените въпроси с текста им, по реда на `ids`. */
    asked: remembered.questions,
    start,
    replacing: start.isPending ? replacing : undefined,
    /**
     * Нов въпрос; с `replaces` („Опитай пак“) новият заема мястото на неуспешния. `applied` са въпросите с приложени
     * промени: изгубените (api не ги знае) не се пращат, а без приложени полето липсва.
     */
    ask(asked: Omit<AskCookingQuestionBody, 'follows'>, replaces?: string) {
      setReplacing(replaces);
      const at = replaces === undefined ? -1 : ids.indexOf(replaces);
      const follows = (at === -1 ? ids : ids.slice(0, at))
        .filter((id) => !isLost(id))
        .at(-1);
      const { applied = [], ...rest } = asked;
      const sent = applied.filter((id) => !isLost(id));
      start.mutate(
        {
          ...rest,
          ...(follows ? { follows } : {}),
          ...(sent.length > 0 ? { applied: sent } : {}),
        },
        {
          onSuccess(question) {
            const asked = { id: question.id, question: question.question };
            remembered.update((current) =>
              replaces && current.some(({ id }) => id === replaces)
                ? current.map((other) =>
                    other.id === replaces ? asked : other,
                  )
                : [...current, asked],
            );
          },
        },
      );
    },
  };
}

export type CookingQuestions = ReturnType<typeof useCookingQuestions>;
