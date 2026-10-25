import { useEffect } from 'react';
import { logger } from '../logger';

let warnedMissing = false;

/**
 * kiosk/TV: екранът не гасне. Иска `screen` wake lock при mount и отново при
 * връщане на страницата (`visibilitychange` → `visible`), защото браузърът го пуска,
 * когато страницата се скрие. Липса или отказ → само `logger.warn`, без UI.
 */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let sentinel: WakeLockSentinel | null = null;
    let active = true;

    const request = async () => {
      if (!('wakeLock' in navigator)) {
        if (!warnedMissing) {
          warnedMissing = true;
          logger.warn('Wake Lock API липсва; екранът може да изгасне');
        }
        return;
      }
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (active) {
          sentinel = lock;
        } else {
          void lock.release();
        }
      } catch (error) {
        logger.warn('Wake lock отказан', error);
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void request();
      }
    };

    void request();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void sentinel?.release();
    };
  }, [enabled]);
}
