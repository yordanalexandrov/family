import type { CookingStep, RecipeStep } from '@family/shared';
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

function stepSpeech(step: number, text: string): string {
  return `Стъпка ${step + 1}. ${text}`;
}
