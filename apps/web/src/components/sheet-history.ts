import { useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Запис в историята за отворен лист: жестът „назад“ на Android го затваря, вместо да напусне екрана.
 *
 * Листът добавя запис със свой маркер и същия URL, а `popstate`, който го маха, вика `onClose`. Затваряне по
 * друг път маха записа с `history.back()`. Запис на лист, който вече е затворен (навигация от линк в листа над
 * него), се прескача при връщане до него, за да не струва едно „назад“ напразно.
 */

const MARKER = 'familySheet';

/** Отворените листове с запис в историята, отдолу нагоре. */
const openSheets: string[] = [];
let seq = 0;
let skipInstalled = false;

function markerOf(state: unknown): string | undefined {
  if (state && typeof state === 'object' && MARKER in state) {
    const marker = (state as Record<string, unknown>)[MARKER];
    return typeof marker === 'string' ? marker : undefined;
  }
  return undefined;
}

function pushEntry(id: string) {
  const state: unknown = window.history.state;
  const base = state && typeof state === 'object' ? state : {};
  // Методът на прототипа, не window.history.pushState: router-ът подменя последния и при всяко отваряне на
  // лист би пуснал навигация до същия екран. Копието на неговото състояние пази индекса му, затова при
  // „назад“ router-ът вижда същото място.
  History.prototype.pushState.call(
    window.history,
    { ...base, [MARKER]: id },
    '',
  );
}

function installStaleSkip() {
  if (skipInstalled) {
    return;
  }
  skipInstalled = true;
  window.addEventListener('popstate', () => {
    const marker = markerOf(window.history.state);
    if (marker !== undefined && !openSheets.includes(marker)) {
      window.history.back();
    }
  });
}

export function useSheetHistory(onClose: () => void) {
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });
  const idRef = useRef<string | null>(null);
  const releasing = useRef(false);

  useEffect(() => {
    installStaleSkip();
    if (releasing.current) {
      // StrictMode пуска ефекта втори път веднага след cleanup-а: записът е същият.
      releasing.current = false;
    } else {
      idRef.current = `${Date.now().toString(36)}-${++seq}`;
      pushEntry(idRef.current);
    }
    const id = idRef.current;
    if (id === null) {
      return;
    }
    if (!openSheets.includes(id)) {
      openSheets.push(id);
    }

    function onPopState() {
      const current = openSheets.indexOf(markerOf(window.history.state) ?? '');
      if (current < openSheets.indexOf(id as string)) {
        onCloseRef.current();
      }
    }
    window.addEventListener('popstate', onPopState);

    return () => {
      window.removeEventListener('popstate', onPopState);
      releasing.current = true;
      queueMicrotask(() => {
        if (!releasing.current) {
          return;
        }
        releasing.current = false;
        openSheets.splice(openSheets.indexOf(id), 1);
        if (markerOf(window.history.state) === id) {
          window.history.back();
        }
      });
    };
  }, []);
}
