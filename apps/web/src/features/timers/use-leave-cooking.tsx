import { useBlocker } from '@tanstack/react-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { isActiveTimer } from './timer-store';
import { useTimers } from './use-timers';
import './leave-cooking.css';

const COOKING_ROUTE = '/recipes/$id/cook';

/** „Има 1 работещ таймер. Излизането го спира…“ / „Има 3 работещи таймера. Излизането ги спира…“ */
function message(count: number): string {
  return count === 1
    ? 'Има 1 работещ таймер. Излизането го спира от звънене.'
    : `Има ${count} работещи таймера. Излизането ги спира от звънене.`;
}

/**
 * Излизането от Готвене с работещ или звънящ таймер спира за потвърждение „Излез / Остани“, защото таймерите звънят
 * само в Готвене. „Излез“ не отменя таймерите. Готвене на друга рецепта не е излизане. Без активен таймер всичко
 * минава както преди.
 *
 * Бутоните за изход („Готово“, „Затвори“) минават през `leave(go)`: `go` излиза с `ignoreBlocker`, за да не пита два
 * пъти. Всяка друга навигация (линк, „назад“ на системата) я спира router-ът.
 */
export function useLeaveCooking(): {
  leave: (go: () => void) => void;
  confirmation: ReactNode;
} {
  const { timers } = useTimers();
  const active = timers.filter(isActiveTimer).length;
  const blocker = useBlocker({
    shouldBlockFn: ({ next }) => active > 0 && next.routeId !== COOKING_ROUTE,
    withResolver: true,
  });
  const [pending, setPending] = useState<(() => void) | null>(null);

  const leave = (go: () => void) => {
    if (active > 0) {
      setPending(() => go);
    } else {
      go();
    }
  };
  const stay = () => {
    setPending(null);
    blocker.reset?.();
  };
  const exit = () => {
    setPending(null);
    if (pending) {
      pending();
    } else {
      blocker.proceed?.();
    }
  };

  const open = pending !== null || blocker.status === 'blocked';
  return {
    leave,
    confirmation: open && (
      <LeaveConfirmation count={active} onStay={stay} onExit={exit} />
    ),
  };
}

interface LeaveConfirmationProps {
  count: number;
  onStay: () => void;
  onExit: () => void;
}

/** Прозорецът над Готвене; „Остани“ е с фокуса, Escape и фонът също оставят. */
function LeaveConfirmation({ count, onStay, onExit }: LeaveConfirmationProps) {
  const stayRef = useRef<HTMLButtonElement>(null);
  const onStayRef = useRef(onStay);
  onStayRef.current = onStay;
  useEffect(() => {
    stayRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onStayRef.current();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="leave-cooking">
      <button
        type="button"
        className="leave-cooking__backdrop"
        aria-label="Остани"
        tabIndex={-1}
        onClick={onStay}
      />
      <div
        className="leave-cooking__panel"
        role="alertdialog"
        aria-modal="true"
        aria-label="Излизане от Готвене"
      >
        <p>{message(count)}</p>
        <div className="leave-cooking__actions">
          <button
            type="button"
            className="button button--quiet"
            onClick={onExit}
          >
            Излез
          </button>
          <button
            ref={stayRef}
            type="button"
            className="button"
            onClick={onStay}
          >
            Остани
          </button>
        </div>
      </div>
    </div>
  );
}
