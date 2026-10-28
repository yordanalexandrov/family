import { useEffect } from 'react';
import './Toast.css';

interface ToastAction {
  label: string;
  onAction: () => void;
}

interface ToastProps {
  message: string | null;
  onDone: () => void;
  durationMs?: number;
  /** Напр. „Върни“ след разрушително действие; с него toast-ът стои по-дълго. */
  action?: ToastAction;
}

const DURATION_MS = 4000;
const ACTION_DURATION_MS = 8000;

/**
 * Кратко съобщение над долната лента; изчезва само след `durationMs`. Действието
 * вика `onAction` и скрива съобщението; изтичането само го скрива.
 */
export function Toast({ message, onDone, durationMs, action }: ToastProps) {
  const duration = durationMs ?? (action ? ACTION_DURATION_MS : DURATION_MS);

  useEffect(() => {
    if (message === null) {
      return;
    }
    const timer = setTimeout(onDone, duration);
    return () => clearTimeout(timer);
  }, [message, onDone, duration]);

  return (
    <div className="toast" role="status" aria-live="polite">
      {message && (
        <p className="toast__message">
          <span>{message}</span>
          {action && (
            <button
              type="button"
              className="toast__action"
              onClick={() => {
                action.onAction();
                onDone();
              }}
            >
              {action.label}
            </button>
          )}
        </p>
      )}
    </div>
  );
}
