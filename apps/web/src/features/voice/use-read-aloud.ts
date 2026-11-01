import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '../../logger';
import { spokenText } from './spoken-text';

/** Четенето на глас на един екран (`useReadAloud`). */
export interface ReadAloud {
  /** Има `speechSynthesis` и български глас: без него 🔊 и всичко за четене не се показват. */
  available: boolean;
  /** Устройството чете в момента (от `read` до края, `stop` или следващото `read`). */
  speaking: boolean;
  /** Чете `text` на български, със съкращенията разгънати (`spokenText`); прекъсва четеното досега. */
  read: (text: string) => void;
  /** Спира четенето; без четене не прави нищо. */
  stop: () => void;
}

function synthesis(): SpeechSynthesis | null {
  return typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined'
    ? window.speechSynthesis
    : null;
}

/** Първият глас с `lang` `bg*` (`bg-BG`, `bg_BG`, `bg`). */
function bulgarianVoice(speech: SpeechSynthesis | null) {
  return (
    speech
      ?.getVoices()
      .find((voice) => voice.lang.toLowerCase().startsWith('bg')) ?? null
  );
}

/**
 * Четене на глас (GLOSSARY) през `speechSynthesis` на браузъра, с първия български глас от `getVoices()`. Chrome
 * зарежда гласовете след страницата, затова hook-ът чака `voiceschanged`, докато `available` стане `true`. Всяко
 * `read` прекъсва предишното, а излизането от екрана (unmount) спира четенето. Един екран държи един `useReadAloud`,
 * за да прекъсват и спират всички четения (стъпка, отговор) едно друго.
 */
export function useReadAloud(): ReadAloud {
  const [voice, setVoice] = useState(() => bulgarianVoice(synthesis()));
  const [speaking, setSpeaking] = useState(false);
  // Изреченото сега: събитията на прекъснатото (`error` след `cancel`) не пипат `speaking` на следващото.
  const current = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    const speech = synthesis();
    if (!speech) {
      return;
    }
    const update = () => setVoice(bulgarianVoice(speech));
    update();
    speech.addEventListener('voiceschanged', update);
    return () => speech.removeEventListener('voiceschanged', update);
  }, []);

  const stop = useCallback(() => {
    const speech = synthesis();
    if (!current.current || !speech) {
      return;
    }
    current.current = null;
    setSpeaking(false);
    speech.cancel();
  }, []);

  const read = useCallback(
    (text: string) => {
      const speech = synthesis();
      if (!speech || !voice) {
        return;
      }
      // `cancel` и без собствено четене: опашката на браузъра може да държи чуждо (друг таб, предишен екран).
      current.current = null;
      speech.cancel();
      const utterance = new SpeechSynthesisUtterance(spokenText(text));
      utterance.voice = voice;
      utterance.lang = voice.lang;
      const ended = (event: Event) => {
        if (current.current !== utterance) {
          return;
        }
        current.current = null;
        setSpeaking(false);
        const error = (event as SpeechSynthesisErrorEvent).error;
        if (error && error !== 'interrupted' && error !== 'canceled') {
          logger.warn('Четенето на глас спря', error);
        }
      };
      utterance.onend = ended;
      utterance.onerror = ended;
      current.current = utterance;
      setSpeaking(true);
      speech.speak(utterance);
    },
    [voice],
  );

  // Излизането от екрана спира четенето.
  useEffect(() => stop, [stop]);

  return { available: voice !== null, speaking, read, stop };
}
