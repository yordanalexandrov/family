import {
  createContext,
  type ReactNode,
  useContext,
  useState,
  useSyncExternalStore,
} from 'react';
import { createTimerStore, type TimerStore } from './timer-store';

const TimerStoreContext = createContext<TimerStore | null>(null);

/** Един store с таймерите за цялото приложение (в `App`), за да преживеят смяната на рецептата и излизането от Готвене. */
export function TimersProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createTimerStore);
  return (
    <TimerStoreContext.Provider value={store}>
      {children}
    </TimerStoreContext.Provider>
  );
}

function useTimerStore(): TimerStore {
  const store = useContext(TimerStoreContext);
  if (!store) {
    throw new Error('useTimers извън TimersProvider');
  }
  return store;
}

/**
 * Таймерите на устройството, следени от React, и действията с тях по `id` (меню на таймера в лентата, сигналът при
 * изтичане).
 */
export function useTimers() {
  const store = useTimerStore();
  const timers = useSyncExternalStore(store.subscribe, store.list);
  const { start, addMinute, pause, resume, restart, cancel } = store;
  return { timers, start, addMinute, pause, resume, restart, cancel };
}
