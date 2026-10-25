import { useEffect, useRef } from 'react';
import {
  type Direction,
  type KioskGrid,
  neighbourSlot,
  type SlotName,
  WIDE_QUERY,
} from './dashboard-slots';

const ARROWS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

/** Решетката, която CSS-ът показва сега; без matchMedia — TV (три колони). */
function currentGrid(): KioskGrid {
  if (typeof matchMedia !== 'function') {
    return 'wide';
  }
  return matchMedia(WIDE_QUERY).matches ? 'wide' : 'narrow';
}

/**
 * TV: дистанционното. Началният фокус е на ядрото; стрелките (стандартните
 * `ArrowUp`… на TV браузърите) местят фокуса между слотовете по разположението на
 * екрана; `Enter` върху слот вика `onEnter`. Връща функция за `ref` на всеки слот.
 */
export function useRemoteFocus(
  enabled: boolean,
  filled: readonly SlotName[],
  onEnter: () => void,
) {
  const elements = useRef(new Map<SlotName, HTMLElement>());
  const latest = useRef({ filled, onEnter });
  latest.current = { filled, onEnter };

  useEffect(() => {
    if (!enabled) {
      return;
    }
    elements.current.get('core')?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      const focused = [...elements.current].find(
        ([, element]) => element === document.activeElement,
      )?.[0];
      if (event.key === 'Enter') {
        if (focused) {
          event.preventDefault();
          latest.current.onEnter();
        }
        return;
      }
      const direction = ARROWS[event.key];
      if (!direction) {
        return;
      }
      event.preventDefault();
      const next = focused
        ? neighbourSlot(
            currentGrid(),
            latest.current.filled,
            focused,
            direction,
          )
        : 'core';
      if (next) {
        elements.current.get(next)?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [enabled]);

  return (slot: SlotName) => (element: HTMLElement | null) => {
    if (element) {
      elements.current.set(slot, element);
    } else {
      elements.current.delete(slot);
    }
  };
}
