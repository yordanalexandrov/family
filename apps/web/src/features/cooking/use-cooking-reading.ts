import type { CookingQuestion, CookingStep, RecipeStep } from '@family/shared';
import { useEffect, useRef } from 'react';
import { useReadAloud } from '../voice/use-read-aloud';
import { useReadSteps } from './cooking-memory';

/** Четенето на глас в Готвене (`useCookingReading`). */
export interface CookingReading {
  /** Има български глас: без него 🔊 и „Чети стъпките“ не се показват. */
  available: boolean;
  /** Устройството чете (стъпка или отговор): гласовите команди приемат само „спри“. */
  speaking: boolean;
  /** Чете текущата стъпка: „Стъпка 3. <показания текст>“. */
  readStep: () => void;
  /** Чете отговора на въпрос в Готвене (🔊 до него или сам при „Чети стъпките“). */
  readAnswer: (answer: string) => void;
  /** Спира четенето; без четене не прави нищо. */
  stop: () => void;
  /** „Чети стъпките“: новата стъпка (и новият отговор) се чете сама. */
  readSteps: boolean;
  setReadSteps: (on: boolean) => void;
}

/**
 * Четене на глас (GLOSSARY) в Готвене: `readStep` чете показания текст на текущата стъпка (с приложените промени за
 * готвенето). Смяната на стъпката прекъсва четенето, а при включено „Чети стъпките“ чете новата. Влизането в Готвене
 * не чете само; излизането спира четенето (`useReadAloud`).
 */
export function useCookingReading(
  steps: readonly CookingStep<RecipeStep>[],
  step: number,
): CookingReading {
  const { available, speaking, read, stop } = useReadAloud();
  const [readSteps, setReadSteps] = useReadSteps();
  const text = steps[step]?.text;
  const readStep = () => {
    if (text !== undefined) {
      read(stepSpeech(step, text));
    }
  };

  // Стъпката, за която е последното изобразяване: само смяната ѝ чете или прекъсва, не влизането и не новият текст.
  const shown = useRef(step);
  useEffect(() => {
    if (shown.current === step) {
      return;
    }
    shown.current = step;
    if (readSteps && text !== undefined) {
      read(stepSpeech(step, text));
    } else {
      stop();
    }
  }, [step, text, readSteps, read, stop]);

  return {
    available,
    speaking,
    readStep,
    readAnswer: read,
    stop,
    readSteps,
    setReadSteps,
  };
}

/**
 * При „Чети стъпките“ чете сам новия отговор на въпрос в Готвене: на въпрос, видян да чака (`pending`), а после дошъл
 * (`done`), и при затворен лист „Въпрос“ (заявките са в `useCookingQuestions`). Ако дойдат няколко наведнъж, чете
 * последния. Отговорите, дошли преди включването, и тези, видени направо `done` (напр. след презареждане), не се четат.
 */
export function useReadNewAnswers(
  questions: readonly (CookingQuestion | undefined)[],
  { readSteps, readAnswer }: CookingReading,
) {
  const seen = useRef(new Map<string, CookingQuestion['status']>());
  const states = questions
    .flatMap((question) =>
      question ? [`${question.id}:${question.status}`] : [],
    )
    .join(' ');
  const latest = useRef(questions);
  latest.current = questions;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `states` е отпечатъкът на `latest.current`
  useEffect(() => {
    let answer: string | undefined;
    for (const question of latest.current) {
      if (!question) {
        continue;
      }
      const before = seen.current.get(question.id);
      seen.current.set(question.id, question.status);
      if (
        before === 'pending' &&
        question.status === 'done' &&
        question.answer
      ) {
        answer = question.answer;
      }
    }
    if (readSteps && answer !== undefined) {
      readAnswer(answer);
    }
  }, [states, readSteps, readAnswer]);
}

function stepSpeech(step: number, text: string): string {
  return `Стъпка ${step + 1}. ${text}`;
}
