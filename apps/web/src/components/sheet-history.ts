import type { ParsedLocation } from '@tanstack/react-router';
import { useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Запис в историята за отворен лист: жестът „назад“ на Android го затваря, вместо да напусне екрана.
 *
 * Листът добавя запис със свой маркер и същия URL, а `popstate`, който го маха, вика `onClose`. Затваряне по
 * друг път маха записа с `history.back()`. Навигация от линк в листа заменя записа на листа, вместо да добави
 * нов над него: „назад“ от новия екран води направо на екрана под листа, а „напред“ — обратно на новия.
 * Листът над друг лист заменя само своя запис; днес в такъв лист няма линкове.
 */

const MARKER = 'familySheet';

/** Отворените листове с запис в историята, отдолу нагоре. */
const openSheets: string[] = [];
let seq = 0;
/** Връща `history.pushState` отпреди първия отворен лист; `null`, докато няма отворен лист. */
let restorePush: (() => void) | null = null;

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

/**
 * Докато има отворен лист, навигация над неговия запис (линк в листа) заменя записа, вместо да добави нов. Индексът
 * на router-а в новия запис е с едно над екрана под листа, точно колкото е и мястото му в историята.
 */
function replacePushOverSheet() {
  const push = window.history.pushState;
  function pushOverSheet(
    this: History,
    ...args: Parameters<History['pushState']>
  ) {
    if (openSheets.includes(markerOf(window.history.state) ?? '')) {
      window.history.replaceState(...args);
      return;
    }
    push.apply(window.history, args);
  }
  window.history.pushState = pushOverSheet;
  return () => {
    // Router, унищожен преди листа, вече е върнал своя оригинал: не го пипаме.
    if (window.history.pushState === pushOverSheet) {
      window.history.pushState = push;
    }
  };
}

export function useSheetHistory(onClose: () => void) {
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });
  const idRef = useRef<string | null>(null);
  const releasing = useRef(false);

  useEffect(() => {
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
    restorePush ??= replacePushOverSheet();

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
        if (openSheets.length === 0) {
          restorePush?.();
          restorePush = null;
        }
        if (markerOf(window.history.state) === id) {
          window.history.back();
        }
      });
    };
  }, []);
}

/**
 * `scrollRestoration` на router-а: превъртането се възстановява само при смяна на записа в историята (друг екран,
 * „назад“ към него). Записът на листа е със същия ключ като екрана под него, затова `history.back()` при затваряне
 * стига до router-а като навигация към същия запис; там възстановяването би върнало превъртането отпреди миг и би
 * прекъснало плавно превъртане, започнато при затварянето (новият ред в Пазаруване, #307).
 */
export function restoreScrollBetweenScreens() {
  let rendered: string | undefined;
  return ({ location }: { location: ParsedLocation }) => {
    const key = location.state.__TSR_key ?? location.href;
    const changed = key !== rendered;
    rendered = key;
    return changed;
  };
}
