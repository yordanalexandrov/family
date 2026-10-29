import type { DateKey } from '@family/shared';
import { useEffect, useState } from 'react';
import { useCheckSync } from './sync';

/** Колко стои обяснението след докосване на иконата. */
const EXPLAIN_MS = 4000;

function waiting(pending: number): string {
  return pending === 1
    ? '1 отметка чака връзка'
    : `${pending} отметки чакат връзка`;
}

function label(pending: number, online: boolean): string {
  if (online) {
    return pending > 0 ? waiting(pending) : 'Всички отметки са изпратени';
  }
  return pending > 0 ? `Няма връзка · ${waiting(pending)}` : 'Няма връзка';
}

function explanation(pending: number, online: boolean): string {
  if (pending > 0) {
    return `${waiting(pending)}, ${pending === 1 ? 'ще се изпрати сама' : 'ще се изпратят сами'}.`;
  }
  return online
    ? 'Всички отметки са изпратени.'
    : 'Няма връзка. Отметките ще чакат и ще се изпратят сами.';
}

/**
 * Иконата за синхронизация на отметките, вдясно в реда „N от M за купуване“ (епик #199). Стои там винаги и е с
 * фиксиран размер, затова нищо не се появява и не се мести: всичко изпратено → приглушена, неизпратени → значка с
 * броя в ъгъла, без връзка → зачертан облак, броят остава. Докосването обяснява и, ако има връзка, праща веднага.
 */
export function SyncIcon({ weekStart }: { weekStart: DateKey }) {
  const { pending, online, sendNow } = useCheckSync(weekStart);
  // Обяснението е за момента на докосването: изпращането веднага след него не го сменя под пръста.
  const [explained, setExplained] = useState<string | null>(null);

  useEffect(() => {
    if (explained === null) {
      return;
    }
    const timer = setTimeout(() => setExplained(null), EXPLAIN_MS);
    return () => clearTimeout(timer);
  }, [explained]);

  function onClick() {
    setExplained(explanation(pending, online));
    if (online && pending > 0) {
      void sendNow();
    }
  }

  return (
    <span className="sync-icon">
      <button
        type="button"
        className="sync-icon__button"
        aria-label={label(pending, online)}
        data-state={!online ? 'offline' : pending > 0 ? 'pending' : 'sent'}
        onClick={onClick}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 18h10.5a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.4 9.1 4.5 4.5 0 0 0 7 18Z" />
          {!online && <path d="M4 4l16 16" />}
        </svg>
        {pending > 0 && (
          <span className="sync-icon__badge" aria-hidden="true">
            {pending}
          </span>
        )}
      </button>
      <span className="sync-icon__explain" role="status">
        {explained}
      </span>
    </span>
  );
}
