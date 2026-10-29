import { formatDataAge, type SyncStatus } from '@family/shared';

/** Името на външната система в надписите на картите. */
export const SYSTEM_NAMES = {
  calendar: 'Google Calendar',
  budget: 'Wallet',
} as const;

/**
 * Жълтият надпис на карта с остарели данни: „Google Calendar не отговаря · данни от
 * вчера“, без успешна синхронизация „Wallet не отговаря — още няма данни“.
 * `undefined`, когато данните са актуални или няма конфигурация.
 */
function staleNote(sync: SyncStatus, now: Date): string | undefined {
  if (sync.status !== 'stale' && sync.status !== 'failed') {
    return undefined;
  }
  const name = SYSTEM_NAMES[sync.source];
  return sync.lastSuccessAt
    ? `${name} не отговаря · данни ${formatDataAge(sync.lastSuccessAt, now)}`
    : `${name} не отговаря — още няма данни`;
}

function unconfiguredNote(sync: SyncStatus): string | undefined {
  return sync.status === 'unconfigured'
    ? `${SYSTEM_NAMES[sync.source]} не е конфигуриран`
    : undefined;
}

/**
 * Надписите на карта според свежестта на източника ѝ: `unconfigured` замества
 * съдържанието („… не е конфигуриран“), `stale` е жълтият надпис отдолу.
 */
export function syncNotes(
  sync: SyncStatus,
  now: Date,
): { unconfigured?: string; stale?: string } {
  return { unconfigured: unconfiguredNote(sync), stale: staleNote(sync, now) };
}
