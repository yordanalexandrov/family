import { useEffect, useRef, useState } from 'react';
import { logger } from '../../logger';
import { type VoiceCommand, voiceCommand } from './voice-command';

/** Слушането на един екран (`useListening`). */
export interface Listening {
  /** Браузърът има `SpeechRecognition`: без него 🎤 не се показва. */
  available: boolean;
  /** Включено с докосване (и не спряно от грешка). */
  on: boolean;
  /** Слуша сега: включено и не на пауза. */
  listening: boolean;
  /**
   * Защо слушането спря само: „Няма достъп до микрофона“, „Слушането иска мрежа“, иначе „Слушането спря“; изчезва при
   * следващото докосване.
   */
  error: string | null;
  /** Докосването на 🎤: пуска или спира слушането. */
  toggle: () => void;
}

/** Слушането спря по друга причина (непозната грешка, браузърът не го пусна отново): 🎤 не е изключено без обяснение. */
const STOPPED = 'Слушането спря';

/** Грешките на `SpeechRecognition` с текст за човека; другите спират със `STOPPED`. */
const ERRORS = new Map([
  ['not-allowed', 'Няма достъп до микрофона'],
  ['service-not-allowed', 'Няма достъп до микрофона'],
  ['audio-capture', 'Няма достъп до микрофона'],
  ['network', 'Слушането иска мрежа'],
]);

/** Грешките, след които слушането продължава: тишина и прекъсването при спиране. */
const PASSING_ERRORS = new Set(['no-speech', 'aborted']);

interface Recognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: Event & { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}

interface RecognitionResultEvent extends Event {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const scope = window as typeof window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

/**
 * Слушане (GLOSSARY) през `SpeechRecognition` на браузъра (`bg-BG`, `continuous`): всяка разпозната фраза, която е
 * гласова команда (`voiceCommand`), стига до `onCommand`. Браузърът спира сам (тишина, лимит), затова след `end`
 * слушането се пуска отново, докато е включено. `paused` го спира, без да го изключва. Не се помни, а излизането от
 * екрана (unmount) го спира. Разпознатият текст не се пази и не се логва (ADR-0010).
 */
export function useListening(
  onCommand: (command: VoiceCommand) => void,
  paused = false,
): Listening {
  const [available] = useState(() => recognitionConstructor() !== null);
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const command = useRef(onCommand);
  command.current = onCommand;
  const listening = on && !paused;

  useEffect(() => {
    const Recognition = recognitionConstructor();
    if (!listening || !Recognition) {
      return;
    }
    const recognition = new Recognition();
    recognition.lang = 'bg-BG';
    recognition.continuous = true;
    recognition.interimResults = false;
    let stopped = false;
    const stop = (message: string) => {
      stopped = true;
      setError(message);
      setOn(false);
    };
    const start = () => {
      try {
        recognition.start();
      } catch (cause) {
        logger.warn('Слушането не тръгна', cause);
        stop(STOPPED);
      }
    };
    recognition.onresult = (event) => {
      for (
        let index = event.resultIndex;
        index < event.results.length;
        index++
      ) {
        const result = event.results[index];
        const heard = result?.isFinal
          ? voiceCommand(result[0]?.transcript ?? '')
          : null;
        if (heard) {
          command.current(heard);
        }
      }
    };
    recognition.onerror = (event) => {
      if (PASSING_ERRORS.has(event.error)) {
        return;
      }
      const message = ERRORS.get(event.error);
      if (!message) {
        logger.warn('Слушането спря', event.error);
      }
      stop(message ?? STOPPED);
    };
    recognition.onend = () => {
      if (!stopped) {
        start();
      }
    };
    start();
    return () => {
      stopped = true;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
    };
  }, [listening]);

  const toggle = () => {
    setError(null);
    setOn((current) => !current);
  };

  return { available, on, listening, error, toggle };
}
