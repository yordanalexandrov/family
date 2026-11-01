import type { CookingStep, RecipeStep } from '@family/shared';
import { useEffect, useRef } from 'react';
import { type ReadAloud, useReadAloud } from '../voice/use-read-aloud';
import { useReadSteps } from './cooking-memory';

/** Четенето на глас в Готвене (`useCookingReading`). */
export interface CookingReading {
  /** Четенето на целия екран: `read` за друг текст (отговора на въпрос), `stop` и `speaking` за гласовите команди. */
  voice: ReadAloud;
  /** Чете текущата стъпка: „Стъпка 3. <показания текст>“. */
  readStep: () => void;
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
  const voice = useReadAloud();
  const [readSteps, setReadSteps] = useReadSteps();
  const text = steps[step]?.text;
  const { read, stop } = voice;
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

  return { voice, readStep, readSteps, setReadSteps };
}

function stepSpeech(step: number, text: string): string {
  return `Стъпка ${step + 1}. ${text}`;
}
