import { logger } from '../../logger';

/** Тонът се повтаря през толкова ms: два кратки сигнала („бип-бип“) и пауза. */
const REPEAT_MS = 1000;
const FREQUENCY_HZ = 880;
/** Начало и дължина (s) на сигналите в един повтор. */
const BEEPS = [
  { at: 0, length: 0.15 },
  { at: 0.25, length: 0.15 },
];
const VOLUME = 0.4;

/**
 * Звукът на изтекъл таймер: синтезиран тон през Web Audio, без аудио файл. Браузърът пуска звук само след докосване,
 * затова `unlock()` се вика в същия клик, който пуска таймера (и от всяко докосване, докато звъни след презареждане).
 */
export interface AlarmSound {
  /** Създава/събужда аудио контекста; работи само в обработчик на докосване. */
  unlock(): void;
  /** Започва повтарящия се тон; повторно извикване не пуска втори. */
  play(): void;
  stop(): void;
}

type AudioContextConstructor = new () => AudioContext;

function audioContextConstructor(): AudioContextConstructor | undefined {
  const scope = globalThis as typeof globalThis & {
    webkitAudioContext?: AudioContextConstructor;
  };
  return scope.AudioContext ?? scope.webkitAudioContext;
}

export function createAlarmSound(): AlarmSound {
  let context: AudioContext | null = null;
  let missing = false;
  let repeat: ReturnType<typeof setInterval> | null = null;

  function getContext(): AudioContext | null {
    if (context || missing) {
      return context;
    }
    const Context = audioContextConstructor();
    try {
      if (!Context) {
        throw new Error('Няма Web Audio');
      }
      context = new Context();
    } catch (error) {
      missing = true;
      logger.warn('Таймерът звъни без звук: няма Web Audio', error);
    }
    return context;
  }

  /** Един повтор: два кратки сигнала. Спрян контекст (без докосване) не трупа сигнали, които да избухнат после. */
  function beep(): void {
    const audio = getContext();
    if (audio?.state !== 'running') {
      return;
    }
    const start = audio.currentTime;
    for (const { at, length } of BEEPS) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = 'square';
      oscillator.frequency.value = FREQUENCY_HZ;
      gain.gain.setValueAtTime(0.0001, start + at);
      gain.gain.exponentialRampToValueAtTime(VOLUME, start + at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + at + length);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(start + at);
      oscillator.stop(start + at + length + 0.02);
    }
  }

  return {
    unlock() {
      const audio = getContext();
      if (audio && audio.state !== 'running') {
        audio.resume().catch((error: unknown) => {
          logger.warn('Звукът на таймера не се отключи', error);
        });
      }
    },
    play() {
      if (repeat !== null) {
        return;
      }
      beep();
      repeat = setInterval(beep, REPEAT_MS);
    },
    stop() {
      if (repeat !== null) {
        clearInterval(repeat);
        repeat = null;
      }
    },
  };
}
