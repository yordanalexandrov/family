import { type ReactNode, useId } from 'react';
import { NEEDS_CONNECTION } from '../lib/use-online';
import './NeedsConnection.css';

interface NeedsConnection {
  /** За `disabled` на бутона; друга причина се добавя с `||`. */
  disabled: boolean;
  /** За `aria-describedby` на всеки бутон, който подсказката описва. */
  describedBy: string | undefined;
  /** „Иска връзка“ без връзка, иначе `null`; стои там, където го види човекът до бутона. */
  hint: ReactNode;
}

/**
 * Действие, което без връзка е изключено с подсказка „Иска връзка“: бутонът (или няколко бутона) получава `disabled`
 * и `aria-describedby` към подсказката. `className` добавя оформление на мястото (напр. до плаващ бутон).
 */
export function useNeedsConnection(
  online: boolean,
  className?: string,
): NeedsConnection {
  const hintId = useId();
  return {
    disabled: !online,
    describedBy: online ? undefined : hintId,
    hint: online ? null : (
      <p
        id={hintId}
        className={
          className ? `needs-connection ${className}` : 'needs-connection'
        }
      >
        {NEEDS_CONNECTION}
      </p>
    ),
  };
}
