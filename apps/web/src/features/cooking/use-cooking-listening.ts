import { useEffect, useState } from 'react';
import { useTimers } from '../timers/use-timers';
import { type Listening, useListening } from '../voice/use-listening';
import { commandLabel, type VoiceCommand } from '../voice/voice-command';
import type { CookingReading } from './use-cooking-reading';

/** Толкова ms разпознатата команда стои до 🎤. */
export const HEARD_MS = 2000;

/** Слушането в Готвене (`useCookingListening`). */
export interface CookingListening extends Listening {
  /** Последната изпълнена команда, за кратко (`HEARD_MS`); иначе `null`. */
  heard: string | null;
}

interface CookingListeningOptions {
  stepCount: number;
  step: number;
  onStepChange: (step: number) => void;
  reading: CookingReading;
}

/**
 * Слушане и гласови команди (GLOSSARY) в Готвене: „напред“ и „назад“ сменят стъпката (на последната „напред“ не прави
 * нищо, „Готово“ е само с докосване), „прочети“ чете стъпката, а „спри“ спира четенето и заглушава звънящите таймери.
 * Докато устройството чете, се приема само „спри“. До 🎤 за кратко стои само команда, която е направила нещо. Слушането е на пауза, докато текстово поле е на фокус (въпросът в
 * Готвене се пише или диктува с клавиатурата).
 */
export function useCookingListening({
  stepCount,
  step,
  onStepChange,
  reading,
}: CookingListeningOptions): CookingListening {
  const { silence } = useTimers();
  const [heard, setHeard] = useState<{ label: string } | null>(null);
  const typing = useTextFieldFocus();

  const goTo = (next: number) => {
    if (next < 0 || next >= stepCount) {
      return false;
    }
    onStepChange(next);
    return true;
  };
  // Какво прави всяка команда; `false` — нямаше какво (последна стъпка, нищо не чете и не звъни) и надпис няма.
  const actions: Record<VoiceCommand, () => boolean> = {
    next: () => goTo(step + 1),
    previous: () => goTo(step - 1),
    read: () => {
      reading.readStep();
      return true;
    },
    stop: () => {
      const reads = reading.speaking;
      reading.stop();
      return silence() || reads;
    },
  };

  const listening = useListening((command) => {
    if (reading.speaking && command !== 'stop') {
      return;
    }
    if (actions[command]()) {
      // Нов обект всеки път: същата команда два пъти подред пак държи надписа `HEARD_MS` от последната.
      setHeard({ label: commandLabel(command) });
    }
  }, typing);

  useEffect(() => {
    if (!heard) {
      return;
    }
    const timeout = setTimeout(() => setHeard(null), HEARD_MS);
    return () => clearTimeout(timeout);
  }, [heard]);

  return {
    ...listening,
    heard: listening.listening ? (heard?.label ?? null) : null,
  };
}

/** Текстово поле (въпросът в Готвене) е на фокус. */
function isTextField(element: Element | null): boolean {
  if (element instanceof HTMLTextAreaElement) {
    return true;
  }
  if (element instanceof HTMLInputElement) {
    return element.type === 'text' || element.type === 'search';
  }
  return element instanceof HTMLElement && element.isContentEditable;
}

/**
 * Текстово поле е на фокус. Смяната на таба или приложението пуска `focusout` без `relatedTarget`, но полето остава
 * `document.activeElement` и пак е на фокус. Полето, махнато заедно с листа, не пуска `focusout`: следят се само
 * преките деца на предците му (не цялата страница), защото махането е промяна в едно от тях.
 */
function useTextFieldFocus(): boolean {
  const [field, setField] = useState<Element | null>(() =>
    isTextField(document.activeElement) ? document.activeElement : null,
  );
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as Element | null;
      setField(isTextField(target) ? target : null);
    };
    // `focusout` идва преди фокусът да се смести: новият е `relatedTarget`.
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget as Element | null;
      if (next === null && document.activeElement === event.target) {
        return;
      }
      setField(isTextField(next) ? next : null);
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);
  useEffect(() => {
    if (!field) {
      return;
    }
    const observer = new MutationObserver(() => {
      if (!field.isConnected) {
        setField(null);
      }
    });
    for (let node = field.parentNode; node; node = node.parentNode) {
      observer.observe(node, { childList: true });
    }
    return () => observer.disconnect();
  }, [field]);
  return field !== null;
}
