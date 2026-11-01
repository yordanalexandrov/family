import type { AskCookingQuestionBody } from '@family/shared';
import { useQueries } from '@tanstack/react-query';
import { useState } from 'react';
import { useRememberedQuestions } from './cooking-memory';
import {
  cookingQuestionQuery,
  useAskCookingQuestion,
  useIsLostQuestion,
} from './questions';

/**
 * Въпросите в Готвене на една рецепта (GLOSSARY: Въпрос в Готвене), зададени от това устройство: id-тата им по реда на
 * задаване, стъпката на всеки и пускането на нов. Въпросите на една стъпка са една верига: всеки нов продължава
 * (`follows`) последния от същата стъпка, на стъпка без въпроси започва нова, а повторният („Опитай пак“) е за
 * стъпката на неуспешния и продължава същия, който продължаваше той. Изгубен въпрос (404) не се продължава: api не го
 * знае, а ако заявката му вече я няма в кеша, api го отказва и въпросът се праща пак без него
 * (`useAskCookingQuestion`). Държи се в `CookingView`, над листа „Въпрос“, за да не се губи при затваряне; отговорите
 * се питат през цялото Готвене (чакащият на 3 s), за да може новият отговор да се прочете сам и при затворен лист.
 * Помнят се на устройството заедно с напредъка в Готвене, до края на деня или до „Готово“.
 */
export function useCookingQuestions(recipeId: string) {
  const remembered = useRememberedQuestions(recipeId);
  const ids = remembered.questions.map(({ id }) => id);
  /** Неуспешният въпрос, чийто „Опитай пак“ се праща в момента. */
  const [replacing, setReplacing] = useState<string>();
  const start = useAskCookingQuestion(recipeId);
  const isLost = useIsLostQuestion();
  const results = useQueries({ queries: ids.map(cookingQuestionQuery) });
  return {
    ids,
    /** Заявките за въпросите, по реда на `ids`. */
    results,
    /** Зададените въпроси с текста и стъпката им, по реда на `ids`; запомненият отпреди стъпките е без стъпка. */
    asked: remembered.questions,
    start,
    replacing: start.isPending ? replacing : undefined,
    /**
     * Нов въпрос за `asked.step`; с `replaces` („Опитай пак“) новият заема мястото на неуспешния и е за неговата стъпка.
     * `applied` са въпросите с приложени промени: изгубените (api не ги знае) не се пращат, а без приложени полето
     * липсва.
     */
    ask(asked: Omit<AskCookingQuestionBody, 'follows'>, replaces?: string) {
      setReplacing(replaces);
      const replaced = remembered.questions.find(({ id }) => id === replaces);
      const step = replaced?.step ?? asked.step;
      const before = replaced
        ? remembered.questions.slice(0, remembered.questions.indexOf(replaced))
        : remembered.questions;
      const follows = before
        .filter((other) => other.step === step && !isLost(other.id))
        .at(-1)?.id;
      const { applied = [], ...rest } = asked;
      const sent = applied.filter((id) => !isLost(id));
      start.mutate(
        {
          ...rest,
          step,
          ...(follows ? { follows } : {}),
          ...(sent.length > 0 ? { applied: sent } : {}),
        },
        {
          onSuccess(question) {
            const asked = {
              id: question.id,
              question: question.question,
              step: question.step,
            };
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
