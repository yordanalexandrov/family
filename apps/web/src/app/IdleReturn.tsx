import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

/** kiosk: без докосване толкова време екранът извън дашборда се връща сам. */
export const IDLE_RETURN_MS = 60_000;

/** kiosk: Готвене се връща на дашборда чак след 2 часа без докосване. */
export const COOKING_IDLE_RETURN_MS = 2 * 60 * 60_000;

/**
 * kiosk: от екраните извън дашборда обратно към него след `timeoutMs`
 * без докосване; всяко `pointerdown` нулира таймера.
 */
export function IdleReturn({
  timeoutMs = IDLE_RETURN_MS,
}: {
  timeoutMs?: number;
}) {
  const navigate = useNavigate();
  useEffect(() => {
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
  }, [navigate, timeoutMs]);
  return null;
}
