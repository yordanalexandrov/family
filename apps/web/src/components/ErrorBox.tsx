import { ApiError } from '../api/client';
import './ErrorBox.css';

interface ErrorBoxProps {
  error: unknown;
  onRetry?: () => void;
}

export const SESSION_EXPIRED_MESSAGE =
  'Сесията е изтекла, презареди страницата';

/** Какво вижда човекът: 401/403 = изтекла Access сесия, друго от api = неговото message. */
export function describeError(error: unknown): {
  message: string;
  sessionExpired: boolean;
} {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return { message: SESSION_EXPIRED_MESSAGE, sessionExpired: true };
    }
    return { message: error.message, sessionExpired: false };
  }
  return { message: 'Няма връзка със сървъра', sessionExpired: false };
}

export function ErrorBox({ error, onRetry }: ErrorBoxProps) {
  const { message, sessionExpired } = describeError(error);
  return (
    <div className="error-box" role="alert">
      <p className="error-box__message">{message}</p>
      {sessionExpired ? (
        <button
          type="button"
          className="button"
          onClick={() => window.location.reload()}
        >
          Презареди
        </button>
      ) : (
        onRetry && (
          <button type="button" className="button" onClick={onRetry}>
            Опитай пак
          </button>
        )
      )}
    </div>
  );
}
