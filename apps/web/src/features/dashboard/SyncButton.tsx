import type { SyncRunResult, SyncSource } from '@family/shared';
import { useEffect, useState } from 'react';
import { ApiError } from '../../api/client';
import { useSync } from '../../api/queries';
import { formatTime } from '../../lib/format';
import { SYSTEM_NAMES } from '../../lib/sync-notes';
import { NEEDS_CONNECTION, useOnline } from '../../lib/use-online';
import './SyncButton.css';

/** Колко стои „Обновено 09:31“ или грешката до иконата. */
const MESSAGE_MS = 5000;

const LABELS: Record<SyncSource, string> = {
  calendar: 'Обнови календара',
  budget: 'Обнови бюджета',
};

function resultMessage(result: SyncRunResult, at: Date): string {
  const name = SYSTEM_NAMES[result.source];
  switch (result.status) {
    case 'ok':
      return `Обновено ${formatTime(at)}`;
    case 'running':
      return 'Вече се обновява';
    case 'unconfigured':
      return `${name} не е конфигуриран`;
    case 'failed':
      return `${name} не отговаря`;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Няма връзка със сървъра';
}

/**
 * Ръчната синхронизация на един източник (`POST /api/sync/:source`): `run` пуска
 * само една заявка наведнъж, `message` е резултатът за кратко („Обновено 09:31“
 * или грешката), после `null`. Без мрежа (`online` е `false`) `run` не прави нищо,
 * иначе заявката би чакала връзката и иконата би се въртяла без край.
 */
function useSourceSync(source: SyncSource) {
  const mutation = useSync(source);
  const online = useOnline();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (message === null) {
      return;
    }
    const timer = setTimeout(() => setMessage(null), MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [message]);

  function run() {
    if (!online || mutation.isPending) {
      return;
    }
    setMessage(null);
    mutation.mutate(undefined, {
      onSuccess: (result) => setMessage(resultMessage(result, new Date())),
      onError: (error) => setMessage(errorMessage(error)),
    });
  }

  return { run, online, pending: mutation.isPending, message };
}

/**
 * Иконата за обновяване на карта на Дашборда (календар или бюджет): докосване
 * синхронизира източника, иконата се върти, после до нея за кратко стои резултатът.
 */
export function SyncButton({ source }: { source: SyncSource }) {
  const { run, online, pending, message } = useSourceSync(source);
  return (
    <span className="sync-button">
      <span className="sync-button__message" role="status">
        {online ? message : NEEDS_CONNECTION}
      </span>
      <button
        type="button"
        className="sync-button__icon"
        aria-label={LABELS[source]}
        aria-disabled={!online || pending || undefined}
        data-pending={pending || undefined}
        onClick={run}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 12a8 8 0 1 1-2.34-5.66" />
          <path d="M20 4v4.5h-4.5" />
        </svg>
      </button>
    </span>
  );
}
