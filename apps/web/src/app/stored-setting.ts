import { logger } from '../logger';

interface StoredSettingOptions<T> {
  key: string;
  /** Суровата стойност (`null`: няма я или localStorage е недостъпен) → настройката. */
  parse: (raw: string | null) => T;
  /** Стойността, при която ключът се маха, вместо да се пише (`auto`, няма потребител). */
  unset: T;
  /** След всяка промяна, преди абонатите: напр. атрибут на <html>. */
  onChange?: () => void;
}

/**
 * Настройка на устройството в localStorage, която React следи с
 * `useSyncExternalStore(setting.subscribe, setting.read)`:
 * промяна от `write`, от друг таб (`storage`) или по `notify()` стига до всеки абонат.
 * Недостъпен localStorage (private режим) се логва и настройката е по подразбиране.
 */
export function storedSetting<T>({
  key,
  parse,
  unset,
  onChange,
}: StoredSettingOptions<T>) {
  const listeners = new Set<() => void>();

  function read(): T {
    try {
      return parse(localStorage.getItem(key));
    } catch (error) {
      logger.warn('localStorage недостъпен', error);
      return parse(null);
    }
  }

  function notify(): void {
    onChange?.();
    for (const listener of listeners) {
      listener();
    }
  }

  function write(value: T): void {
    try {
      if (value === unset) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, String(value));
      }
    } catch (error) {
      logger.warn('localStorage недостъпен', error);
    }
    notify();
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    window.addEventListener('storage', notify);
    return () => {
      listeners.delete(listener);
      window.removeEventListener('storage', notify);
    };
  }

  return { read, write, notify, subscribe };
}
