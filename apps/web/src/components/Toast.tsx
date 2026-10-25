import { useEffect } from 'react';
import './Toast.css';

interface ToastProps {
  message: string | null;
  onDone: () => void;
  durationMs?: number;
}

/** Кратко съобщение над долната лента; изчезва само след `durationMs`. */
export function Toast({ message, onDone, durationMs = 4000 }: ToastProps) {
  useEffect(() => {
    if (message === null) {
      return;
    }
    const timer = setTimeout(onDone, durationMs);
    return () => clearTimeout(timer);
  }, [message, onDone, durationMs]);

  return (
    <div className="toast" role="status" aria-live="polite">
      {message && <p className="toast__message">{message}</p>}
    </div>
  );
}
