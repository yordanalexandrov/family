import type { AskCookingQuestion } from '@family/shared';
import { useState } from 'react';
import { useAskCookingQuestion } from './questions';

/**
 * Въпросите в Готвене на една рецепта (GLOSSARY: Въпрос в Готвене), зададени от това устройство: id-тата им по реда на
 * задаване и пускането на нов. Те са една верига: всеки нов продължава (`follows`) последния, а повторният („Опитай
 * пак“) — същия, който продължаваше неуспешният. Държи се в `CookingView`, над листа „Въпрос“, за да продължи чакането, докато листът е
 * затворен. Засега живее само докато Готвене е отворено; паметта до края на деня или до „Готово“ е #275.
 */
export function useCookingQuestions(recipeId: string) {
  const [ids, setIds] = useState<readonly string[]>([]);
  /** Неуспешният въпрос, чийто „Опитай пак“ се праща в момента. */
  const [replacing, setReplacing] = useState<string>();
  const start = useAskCookingQuestion(recipeId);
  return {
    ids,
    start,
    replacing: start.isPending ? replacing : undefined,
    /** Нов въпрос; с `replaces` („Опитай пак“) новият заема мястото на неуспешния. */
    ask(asked: Omit<AskCookingQuestion, 'follows'>, replaces?: string) {
      setReplacing(replaces);
      const at = replaces === undefined ? -1 : ids.indexOf(replaces);
      const follows = at === -1 ? ids.at(-1) : ids[at - 1];
      start.mutate({ ...asked, ...(follows ? { follows } : {}) }, {
        onSuccess(question) {
          setIds((current) =>
            replaces && current.includes(replaces)
              ? current.map((id) => (id === replaces ? question.id : id))
              : [...current, question.id],
          );
        },
      });
    },
  };
}

export type CookingQuestions = ReturnType<typeof useCookingQuestions>;
