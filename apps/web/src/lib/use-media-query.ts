import { useCallback, useSyncExternalStore } from 'react';

/**
 * Дали медия-заявката важи сега; следи промяната (напр. завъртане на телефона). Без `matchMedia` (jsdom) връща
 * `fallback`.
 */
export function useMediaQuery(query: string, fallback: boolean): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof matchMedia !== 'function') {
        return () => {};
      }
      const list = matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () =>
    typeof matchMedia === 'function' ? matchMedia(query).matches : fallback,
  );
}
