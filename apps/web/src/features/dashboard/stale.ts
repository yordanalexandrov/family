import { formatAge, type SyncStatus } from '@family/shared';

/** Името на външната система в надписите на картите. */
export const SYSTEM_NAMES = {
  calendar: 'Google Calendar',
  budget: 'Wallet',
} as const;

/**
 * Жълтият надпис на карта с остарели данни: „Google Calendar не отговаря · данни от
 * преди 25 мин“. `undefined`, когато данните са актуални или няма конфигурация.
 */
export function staleNote(sync: SyncStatus, now: Date): string | undefined {
  if (sync.status !== 'stale' && sync.status !== 'failed') {
    return undefined;
  }
  const name = SYSTEM_NAMES[sync.source];
  const age = sync.lastSuccessAt
    ? `данни от ${formatAge(sync.lastSuccessAt, now)}`
    : 'още няма данни';
  return `${name} не отговаря · ${age}`;
}

export function unconfiguredNote(sync: SyncStatus): string | undefined {
  return sync.status === 'unconfigured'
    ? `${SYSTEM_NAMES[sync.source]} не е конфигуриран`
    : undefined;
}
