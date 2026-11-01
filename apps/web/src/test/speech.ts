import { act } from '@testing-library/react';
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

/** One recognized phrase as `SpeechRecognitionResult` gives it: the alternatives and `isFinal`. */
type FakeResult = { transcript: string; confidence: number }[] & {
  isFinal: boolean;
};

/**
 * A fake `SpeechRecognition` (or `webkitSpeechRecognition`, as Chrome names it) for the test, removed when it ends.
 * `start()` throws while already started, as in the browser; `stop()` and `abort()` end the session (`abort` with the
 * `aborted` error first). `say`, `end` and `fail` are the browser's side: a final phrase, the session ending by itself,
 * an error (followed by `end`, as in Chrome).
 */
export function fakeRecognition({ prefixed = false } = {}) {
  const instances: FakeRecognition[] = [];
  let starts = 0;

  class FakeRecognition extends EventTarget {
    lang = '';
    continuous = false;
    interimResults = false;
    maxAlternatives = 1;
    onstart: ((event: Event) => void) | null = null;
    onresult: ((event: Event) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onend: ((event: Event) => void) | null = null;
    running = false;
    /** The results of this session: `continuous` keeps them, a new `start` begins anew. */
    results: FakeResult[] = [];

    constructor() {
      super();
      instances.push(this);
    }

    fire(type: 'start' | 'result' | 'error' | 'end', extra: object = {}) {
      const event = Object.assign(new Event(type), extra);
      this.dispatchEvent(event);
      this[`on${type}`]?.(event);
    }

    start() {
      if (this.running) {
        throw new DOMException(
          'recognition has already started',
          'InvalidStateError',
        );
      }
      starts += 1;
      this.running = true;
      this.results = [];
      this.fire('start');
    }

    stop() {
      this.finish();
    }

    abort() {
      if (this.running) {
        this.fire('error', { error: 'aborted', message: '' });
      }
      this.finish();
    }

    finish() {
      if (!this.running) {
        return;
      }
      this.running = false;
      this.fire('end');
    }
  }

  vi.stubGlobal(
    prefixed ? 'webkitSpeechRecognition' : 'SpeechRecognition',
    FakeRecognition,
  );
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });

  const running = () => instances.find((instance) => instance.running) ?? null;
  const require = () => {
    const instance = running();
    if (!instance) {
      throw new Error('Nothing is listening');
    }
    return instance;
  };

  return {
    /** Something is listening now. */
    listening: () => running() !== null,
    /** How many times `start()` was called, over all instances. */
    starts: () => starts,
    /** The settings of the session listening now. */
    settings() {
      const { lang, continuous } = require();
      return { lang, continuous };
    },
    /** The browser recognizes `transcript` as a final phrase. */
    say(transcript: string) {
      const instance = require();
      const result = Object.assign([{ transcript, confidence: 0.9 }], {
        isFinal: true,
      });
      instance.results.push(result);
      act(() => {
        instance.fire('result', {
          resultIndex: instance.results.length - 1,
          results: instance.results,
        });
      });
    },
    /** The session ends by itself (silence, Chrome's limit). */
    end() {
      const instance = require();
      act(() => instance.finish());
    },
    /** The browser reports `error` (`not-allowed`, `network`, `no-speech`…), then ends the session. */
    fail(error: string) {
      const instance = require();
      act(() => {
        instance.fire('error', { error, message: '' });
        instance.finish();
      });
    },
  };
}
