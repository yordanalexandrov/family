import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

/** kiosk: без докосване толкова време екранът извън дашборда се връща сам. */
export const IDLE_RETURN_MS = 60_000;

/**
 * kiosk: от календара и настройките обратно към дашборда след `IDLE_RETURN_MS`
 * без докосване; всяко `pointerdown` нулира таймера.
 */
export function IdleReturn() {
  const navigate = useNavigate();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const restart = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void navigate({ to: '/' }), IDLE_RETURN_MS);
    };
    restart();
    document.addEventListener('pointerdown', restart);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', restart);
    };
  }, [navigate]);
  return null;
}
