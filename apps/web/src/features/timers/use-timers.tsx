import {
  createContext,
  type ReactNode,
  useContext,
  useState,
  useSyncExternalStore,
} from 'react';
import { type AlarmSound, createAlarmSound } from './alarm-sound';
import {
  createTimerStore,
  type NewTimer,
  type TimerStore,
} from './timer-store';

interface Timers {
  store: TimerStore;
  sound: AlarmSound;
  /** Действията, които пускат броене (пускане, „+1 мин“, „Повтори“): винаги от докосване, затова отключват и звука. */
  start(timer: NewTimer): ReturnType<TimerStore['start']>;
  addMinute(id: string): void;
  restart(id: string): void;
  /** Заглушените изтичания (`silence`): изтеклите досега звънят безшумно; следващото изтичане звъни пак. */
  silenced: Silenced;
}

interface Silenced {
  /** Изтичанията до този момент (ms от epoch) не звучат; `0` — нищо не е заглушено. */
  until(): number;
  silence(): void;
  subscribe(listener: () => void): () => void;
}

function createSilenced(): Silenced {
  let until = 0;
  const listeners = new Set<() => void>();
  return {
    until: () => until,
    silence() {
      until = Date.now();
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const TimersContext = createContext<Timers | null>(null);

function createTimers(): Timers {
  const store = createTimerStore();
  const sound = createAlarmSound();
  return {
    store,
    sound,
    silenced: createSilenced(),
    start(timer) {
      sound.unlock();
      return store.start(timer);
    },
    addMinute(id) {
      sound.unlock();
      store.addMinute(id);
    },
    restart(id) {
      sound.unlock();
      store.restart(id);
    },
  };
}

/**
 * Един store с таймерите и един звук за цялото приложение (в `App`), за да преживеят смяната на рецептата и излизането
 * от Готвене.
 */
export function TimersProvider({ children }: { children: ReactNode }) {
  const [timers] = useState(createTimers);
  return (
    <TimersContext.Provider value={timers}>{children}</TimersContext.Provider>
  );
}

function useTimersContext(): Timers {
  const timers = useContext(TimersContext);
  if (!timers) {
    throw new Error('useTimers извън TimersProvider');
  }
  return timers;
}

/**
 * Таймерите на устройството, следени от React, и действията с тях по `id` (меню на таймера в лентата, сигналът при
 * изтичане).
 */
export function useTimers() {
  const { store, start, addMinute, restart, silenced } = useTimersContext();
  const timers = useSyncExternalStore(store.subscribe, store.list);
  const { pause, resume, cancel } = store;
  return {
    timers,
    start,
    addMinute,
    pause,
    resume,
    restart,
    cancel,
    /** Заглушава звъненето на изтеклите таймери (гласовата команда „спри“); банерите остават. */
    silence: silenced.silence,
  };
}

/** Докога изтичанията са заглушени (`silence`): изтекъл таймер с `endsAt` до този момент не звучи. */
export function useSilencedUntil(): number {
  const { silenced } = useTimersContext();
  return useSyncExternalStore(silenced.subscribe, silenced.until);
}

/** Звукът на изтеклите таймери (`TimerAlarms`). */
export function useAlarmSound(): AlarmSound {
  return useTimersContext().sound;
}
