import { type RefObject, useEffect, useLayoutEffect, useRef } from 'react';

/** От тази ширина листът е прозорец в средата (виж Sheet.css), а не лист отдолу: там няма плъзгане. */
export const SHEET_WINDOW_QUERY = '(min-width: 48rem)';
/** Плъзгане с над тази част от височината на листа го затваря. */
const CLOSE_FRACTION = 0.25;
/** Бърз жест надолу (px/ms) затваря и по-късо плъзгане, стига да е поне `FLICK_MIN_PX`. */
const FLICK_VELOCITY = 0.5;
const FLICK_MIN_PX = 24;

function isWindow() {
  return (
    typeof matchMedia === 'function' && matchMedia(SHEET_WINDOW_QUERY).matches
  );
}

/** Дали съдържанието под пръста е превъртяно: самият панел или вложена превъртаема област в него (напр. изборът на рецепта). */
function isScrolled(target: EventTarget | null, panel: HTMLElement): boolean {
  for (
    let node = target instanceof Element ? target : null;
    node;
    node = node.parentElement
  ) {
    if (node.scrollTop > 0) {
      return true;
    }
    if (node === panel) {
      return false;
    }
  }
  return panel.scrollTop > 0;
}

interface Sample {
  y: number;
  t: number;
}

/**
 * Листът на телефона се затваря с плъзгане надолу, когато съдържанието му е превъртяно до горе: панелът следва пръста,
 * а при пускане над прага (четвърт от височината или бърз жест) вика `onClose`; под прага се връща на мястото си.
 * Докато съдържанието под пръста е превъртяно (панелът или вложен списък в него), жестът си превърта.
 */
export function useSheetDrag(
  panelRef: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const current = panelRef.current;
    if (!current) {
      return;
    }
    const panel: HTMLElement = current;
    let start: Sample | null = null;
    let previous: Sample | null = null;
    let last: Sample | null = null;
    let dragging = false;
    let origin: EventTarget | null = null;

    function reset() {
      start = previous = last = null;
      origin = null;
      dragging = false;
    }

    function release() {
      panel.classList.remove('sheet__panel--dragging');
      panel.style.transform = '';
    }

    function onStart(event: TouchEvent) {
      reset();
      const touch = event.touches[0];
      if (
        event.touches.length !== 1 ||
        !touch ||
        isWindow() ||
        isScrolled(event.target, panel)
      ) {
        return;
      }
      origin = event.target;
      start = last = { y: touch.clientY, t: performance.now() };
    }

    function onMove(event: TouchEvent) {
      const touch = event.touches[0];
      if (!start || !touch) {
        return;
      }
      const dy = touch.clientY - start.y;
      if (!dragging) {
        if (dy <= 0 || isScrolled(origin, panel)) {
          // Нагоре е превъртане на съдържанието: жестът не е плъзгане на листа.
          reset();
          return;
        }
        dragging = true;
        panel.classList.add('sheet__panel--dragging');
      }
      if (event.cancelable) {
        event.preventDefault();
      }
      previous = last;
      last = { y: touch.clientY, t: performance.now() };
      panel.style.transform = `translateY(${Math.max(0, dy)}px)`;
    }

    function onEnd() {
      if (!dragging || !start || !last) {
        reset();
        return;
      }
      const dy = last.y - start.y;
      const velocity =
        previous && last.t > previous.t
          ? (last.y - previous.y) / (last.t - previous.t)
          : 0;
      const height = panel.offsetHeight;
      const close =
        dy > height * CLOSE_FRACTION ||
        (velocity > FLICK_VELOCITY && dy >= FLICK_MIN_PX);
      reset();
      release();
      if (close) {
        onCloseRef.current();
      }
    }

    // Не-пасивен touchmove: докато листът се плъзга, страницата под него не се превърта.
    panel.addEventListener('touchstart', onStart, { passive: true });
    panel.addEventListener('touchmove', onMove, { passive: false });
    panel.addEventListener('touchend', onEnd);
    panel.addEventListener('touchcancel', onEnd);
    return () => {
      panel.removeEventListener('touchstart', onStart);
      panel.removeEventListener('touchmove', onMove);
      panel.removeEventListener('touchend', onEnd);
      panel.removeEventListener('touchcancel', onEnd);
    };
  }, [panelRef]);
}
