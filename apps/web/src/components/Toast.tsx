import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import './Toast.css';

/** Съобщението на екрана, по избор с „Върни“ след разрушително действие. */
export interface ToastMessage {
  message: string;
  undo?: () => void;
}

interface ToastProps {
  message: string | null;
  onDone: () => void;
  durationMs?: number;
  /** „Върни“ до съобщението; с него toast-ът стои по-дълго. */
  undo?: () => void;
}

const DURATION_MS = 4000;
const UNDO_DURATION_MS = 8000;

/**
 * Кратко съобщение над долната лента; изчезва само след `durationMs`. „Върни“
 * вика `undo` и скрива съобщението; изтичането само го скрива. Рендерира се в
 * `document.body`: карта с `backdrop-filter` или анимиран `translate` става
 * containing block за `position: fixed` и toast-ът иначе застава в нея (A-19).
 */
export function Toast({ message, onDone, durationMs, undo }: ToastProps) {
  const duration = durationMs ?? (undo ? UNDO_DURATION_MS : DURATION_MS);

  useEffect(() => {
    if (message === null) {
      return;
    }
    const timer = setTimeout(onDone, duration);
    return () => clearTimeout(timer);
  }, [message, onDone, duration]);

  return createPortal(
    <div className="toast" role="status" aria-live="polite">
      {message && (
        <p className="toast__message">
          <span>{message}</span>
          {undo && (
            <button
              type="button"
              className="toast__action"
              onClick={() => {
                undo();
                onDone();
              }}
            >
              Върни
            </button>
          )}
        </p>
      )}
    </div>,
    document.body,
  );
}
