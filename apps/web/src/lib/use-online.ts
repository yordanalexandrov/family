import { useEffect, useState } from 'react';

/** Надписът на действие, което без мрежа е изключено (обновяване, синхронизация). */
export const NEEDS_CONNECTION = 'Иска връзка';

/** Дали има връзка (`navigator.onLine`), обновявано при `online` и `offline`. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}
