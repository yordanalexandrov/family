import { onTestFinished, vi } from 'vitest';

/** A voice as `speechSynthesis.getVoices()` gives it. */
export interface FakeVoice {
  name: string;
  lang: string;
}

export const bulgarianVoice: FakeVoice = {
  name: 'Google български',
  lang: 'bg-BG',
};
export const englishVoice: FakeVoice = {
  name: 'Google US English',
  lang: 'en-US',
};

/** `SpeechSynthesisUtterance` in jsdom: the text, the voice and the events the browser fires on it. */
class FakeUtterance extends EventTarget {
  text: string;
  lang = '';
  voice: FakeVoice | null = null;
  rate = 1;
  pitch = 1;
  volume = 1;
  onstart: ((event: Event) => void) | null = null;
  onend: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(text = '') {
    super();
    this.text = text;
  }

  fire(type: 'start' | 'end' | 'error', error?: string) {
    const event = Object.assign(new Event(type), { utterance: this, error });
    this.dispatchEvent(event);
    this[`on${type}`]?.(event);
  }
}

/** What was handed to `speak`, in order: the text and the voice's `lang`. */
export interface Spoken {
  text: string;
  voice: string | undefined;
}

/**
 * A fake `speechSynthesis` (and `SpeechSynthesisUtterance`) for the test, removed when it ends. `voices` are there
 * from the start; `loadVoices` adds them later with `voiceschanged`, the way Chrome loads them. The utterance handed to
 * `speak` starts at once and speaks until `finish()` or `cancel()` (an `error` with `interrupted`, as in Chrome).
 */
export function fakeSpeech({ voices = [bulgarianVoice] } = {}) {
  let available = [...voices];
  const spoken: Spoken[] = [];
  let current: FakeUtterance | null = null;
  let cancels = 0;

  class FakeSynthesis extends EventTarget {
    onvoiceschanged: ((event: Event) => void) | null = null;
    get speaking() {
      return current !== null;
    }
    get pending() {
      return false;
    }
    get paused() {
      return false;
    }
    getVoices() {
      return [...available];
    }
    speak(utterance: FakeUtterance) {
      // The browser queues behind what is speaking; the code under test cancels first, so the queue is never used.
      if (current) {
        throw new Error(`speak() while still speaking „${current.text}“`);
      }
      spoken.push({ text: utterance.text, voice: utterance.voice?.lang });
      current = utterance;
      utterance.fire('start');
    }
    cancel() {
      cancels += 1;
      const interrupted = current;
      current = null;
      interrupted?.fire('error', 'interrupted');
    }
    pause() {}
    resume() {}
  }

  const synthesis = new FakeSynthesis();
  vi.stubGlobal('speechSynthesis', synthesis);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });

  return {
    /** Everything handed to `speak`, in order. */
    spoken,
    /** The text speaking now; `null` when silent. */
    speaking: () => current?.text ?? null,
    /** How many times `cancel()` was called. */
    cancels: () => cancels,
    /** The voices arrive, as Chrome loads them after the page. */
    loadVoices(next: FakeVoice[]) {
      available = [...next];
      const event = new Event('voiceschanged');
      synthesis.dispatchEvent(event);
      synthesis.onvoiceschanged?.(event);
    },
    /** The utterance speaking now ends by itself. */
    finish() {
      const done = current;
      current = null;
      done?.fire('end');
    },
  };
}
