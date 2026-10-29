import type { AnyRecipeSuggestion } from '@family/shared';
import { useNavigate } from '@tanstack/react-router';
import { useCallback, useRef } from 'react';
import { ErrorBox } from '../../components/ErrorBox';
import {
  Toast,
  type ToastAction,
  type ToastMessage,
} from '../../components/Toast';
import { useRestoreSuggestion } from './queries';

interface DecisionToastProps {
  /** Id-то на току-що отхвърленото предложение: „Отхвърлено · Върни“. */
  rejected?: string | undefined;
  /** Id-то на току-що одобрената рецепта: „Рецептата е в регистъра · Отвори“. */
  approved?: string | undefined;
  /** Чисти решението от search-а (изтичане или действие), за да не се появи пак при презареждане. */
  onClear: () => void;
  /** След „Върни“: напр. обратно към прегледа на внасянето. */
  onRestored?: (suggestion: AnyRecipeSuggestion) => void;
}

/** Toast-ът след решение в прегледа на предложение (от заявка или от внасяне). */
export function DecisionToast({
  rejected,
  approved,
  onClear,
  onRestored,
}: DecisionToastProps) {
  const navigate = useNavigate();
  const restore = useRestoreSuggestion();
  // „Отвори“ напуска екрана: чистенето след действието не бива да върне тук.
  const leaving = useRef(false);
  const clear = useCallback(() => {
    if (!leaving.current) {
      onClear();
    }
  }, [onClear]);
  const toast: (ToastMessage & { action?: ToastAction }) | null = rejected
    ? {
        message: 'Отхвърлено',
        undo: () => restore.mutate(rejected, { onSuccess: onRestored }),
      }
    : approved
      ? {
          message: 'Рецептата е в регистъра',
          action: {
            label: 'Отвори',
            onAction: () => {
              leaving.current = true;
              void navigate({ to: '/recipes/$id', params: { id: approved } });
            },
          },
        }
      : null;
  return (
    <>
      {restore.isError && <ErrorBox error={restore.error} />}
      <Toast
        message={toast?.message ?? null}
        undo={toast?.undo}
        action={toast?.action}
        onDone={clear}
      />
    </>
  );
}
