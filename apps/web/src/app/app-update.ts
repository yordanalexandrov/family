import { useSyncExternalStore } from 'react';
import { logger } from '../logger';

/*
 * Нова версия на приложението (#174). Новият service worker не поема сам (src/sw.ts чака SKIP_WAITING): докато
 * чака, `UpdateBar` показва „Има нова версия · Обнови“. „Обнови“ му праща SKIP_WAITING, а страницата се презарежда,
 * когато той поеме (`controllerchange`). При връщане в приложението се проверява за нова версия; ако е било скрито
 * поне `HIDDEN_RELOAD_MS` и няма отворен лист или попълнена форма, чакащата версия поема сама.
 */

/** Скрито поне толкова, приложението при връщане презарежда с чакащата версия само. */
export const HIDDEN_RELOAD_MS = 5 * 60_000;

type WorkerLike = Pick<
  ServiceWorker,
  'state' | 'postMessage' | 'addEventListener'
>;

/** Частта от средата, която модулът ползва; в браузъра е истинската, в spec-а фалшива. */
export interface AppUpdateEnv {
  registration: {
    readonly waiting: WorkerLike | null;
    readonly installing: WorkerLike | null;
    update(): Promise<unknown>;
    addEventListener(type: 'updatefound', listener: () => void): void;
    removeEventListener(type: 'updatefound', listener: () => void): void;
  };
  container: {
    readonly controller: object | null;
    addEventListener(type: 'controllerchange', listener: () => void): void;
    removeEventListener(type: 'controllerchange', listener: () => void): void;
  };
  document: {
    readonly visibilityState: DocumentVisibilityState;
    addEventListener(type: 'visibilitychange', listener: () => void): void;
    removeEventListener(type: 'visibilitychange', listener: () => void): void;
  };
  reload(): void;
  now(): number;
  /** Отворен лист или попълнена форма: тогава приложението не презарежда само. */
  isBusy(): boolean;
}

interface UpdateState {
  available: boolean;
  apply: () => void;
}

const IDLE: UpdateState = { available: false, apply: () => {} };

let state: UpdateState = IDLE;
const listeners = new Set<() => void>();

function setState(next: UpdateState) {
  state = next;
  for (const listener of listeners) {
    listener();
  }
}

/** Следи регистрацията за чакаща нова версия; връща функция, която спира следенето. */
export function startAppUpdate(env: AppUpdateEnv): () => void {
  const { registration, container, document } = env;
  let requested = false;
  let hiddenAt: number | null = null;

  const apply = () => {
    const waiting = registration.waiting;
    if (!waiting) {
      return;
    }
    requested = true;
    waiting.postMessage({ type: 'SKIP_WAITING' });
  };

  // Без controller това е първото инсталиране, не нова версия.
  const check = () => {
    if (registration.waiting && container.controller) {
      setState({ available: true, apply });
    }
  };

  const onUpdateFound = () => {
    const installing = registration.installing;
    installing?.addEventListener('statechange', () => {
      if (installing.state === 'installed') {
        check();
      }
    });
  };

  // Само след „Обнови“: при първото инсталиране clientsClaim също сменя controller-а.
  const onControllerChange = () => {
    if (requested) {
      requested = false;
      env.reload();
    }
  };

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = env.now();
      return;
    }
    const hiddenFor = hiddenAt === null ? 0 : env.now() - hiddenAt;
    hiddenAt = null;
    if (state.available && hiddenFor >= HIDDEN_RELOAD_MS && !env.isBusy()) {
      apply();
      return;
    }
    void registration.update().catch(() => {});
  };

  registration.addEventListener('updatefound', onUpdateFound);
  container.addEventListener('controllerchange', onControllerChange);
  document.addEventListener('visibilitychange', onVisibility);
  check();

  return () => {
    registration.removeEventListener('updatefound', onUpdateFound);
    container.removeEventListener('controllerchange', onControllerChange);
    document.removeEventListener('visibilitychange', onVisibility);
    setState(IDLE);
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Чака ли нова версия и как да поеме. */
export function useAppUpdate(): UpdateState {
  return useSyncExternalStore(subscribe, () => state);
}

/** Текстови полета, които човек попълва; отметки и бутони не са незапазена работа. */
const TEXT_FIELDS =
  'form input:not([type="hidden"],[type="checkbox"],[type="radio"],[type="button"],[type="submit"]), form textarea';

/** Отворен лист или диалог, или форма с попълнено поле: презареждането би изгубило каквото човек прави. */
function hasUnsavedWork(): boolean {
  if (document.querySelector('[role="dialog"], [role="alertdialog"]')) {
    return true;
  }
  return Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      TEXT_FIELDS,
    ),
  ).some((field) => field.value.trim() !== '');
}

/** Регистрира service worker-а (src/sw.ts) и следи за нова версия. Само в production build-а. */
export function registerAppUpdate(): void {
  if (!('serviceWorker' in navigator)) {
    return;
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        startAppUpdate({
          registration,
          container: navigator.serviceWorker,
          document,
          reload: () => window.location.reload(),
          now: Date.now,
          isBusy: hasUnsavedWork,
        });
      })
      .catch((error: unknown) => {
        logger.warn('service worker не се регистрира', error);
      });
  });
}
