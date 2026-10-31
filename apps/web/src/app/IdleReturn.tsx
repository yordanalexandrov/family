import { useMatch, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { isActiveTimer } from '../features/timers/active-timers';
import { useTimers } from '../features/timers/use-timers';

/** kiosk: без докосване толкова време екранът извън дашборда се връща сам. */
export const IDLE_RETURN_MS = 60_000;

/** kiosk: Готвене се връща на дашборда чак след 2 часа без докосване. */
export const COOKING_IDLE_RETURN_MS = 2 * 60 * 60_000;

/**
 * kiosk: от екраните извън дашборда обратно към него след `IDLE_RETURN_MS`
 * (от Готвене — след `COOKING_IDLE_RETURN_MS`) без докосване; всяко
 * `pointerdown` нулира таймера. Докато има работещ или звънящ таймер, Готвене не се връща: таймерите звънят само в
 * него; броенето почва отначало, щом няма такъв.
 */
export function IdleReturn() {
  const navigate = useNavigate();
  const cooking = useMatch({ from: '/recipes/$id/cook', shouldThrow: false });
  const timeoutMs = cooking ? COOKING_IDLE_RETURN_MS : IDLE_RETURN_MS;
  const { timers } = useTimers();
  const holding = cooking !== undefined && timers.some(isActiveTimer);
  useEffect(() => {
    if (holding) {
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const restart = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void navigate({ to: '/' }), timeoutMs);
    };
    restart();
    document.addEventListener('pointerdown', restart);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', restart);
    };
  }, [navigate, timeoutMs, holding]);
  return null;
}
