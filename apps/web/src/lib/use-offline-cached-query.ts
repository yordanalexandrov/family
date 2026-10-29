import type { UseQueryResult } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { isConnectionError } from '../api/client';
import type { OfflineCache } from './offline-cache';
import { useOnline } from './use-online';

/** Грешката без мрежа преди първия отговор: не е от api-то, затова `ErrorBox` казва „Няма връзка със сървъра“. */
const NO_CONNECTION = new Error('offline');

export type OfflineCachedData<T> =
  | { status: 'pending' }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'ok'; data: T; refetch: () => void }
  /** Няма мрежа или сървърът не отговаря: последният успешен отговор от кеша. */
  | { status: 'offline'; data: T; fetchedAt: Date; refetch: () => void };

/**
 * Заявка на екран с офлайн кеша му: пише всеки успешен отговор, чете го при връзка, която не става,
 * и веднага щом `navigator.onLine` стане `false` (react-query тогава само чака и не дава грешка).
 * `usable` казва какво от записаното още става за показване (`null` — нищо).
 */
export function useOfflineCachedQuery<T>(
  query: UseQueryResult<T>,
  cache: OfflineCache<T>,
  usable: (cached: T) => T | null = (cached) => cached,
): OfflineCachedData<T> {
  const online = useOnline();
  const { data, dataUpdatedAt, error, errorUpdatedAt, refetch } = query;

  useEffect(() => {
    if (data) {
      cache.write(data, new Date(dataUpdatedAt));
    }
  }, [cache, data, dataUpdatedAt]);

  const offline = !online || (query.isError && isConnectionError(error));
  // biome-ignore lint/correctness/useExhaustiveDependencies: при всяка нова грешка или нов отговор кешът се чете наново
  const entry = useMemo(
    () => (offline ? cache.read() : null),
    [cache, offline, errorUpdatedAt, dataUpdatedAt],
  );
  const cached = entry && usable(entry.data);

  if (entry && cached) {
    return {
      status: 'offline',
      data: cached,
      fetchedAt: entry.fetchedAt,
      refetch: () => void refetch(),
    };
  }
  if (query.isError) {
    return { status: 'error', error, retry: () => void refetch() };
  }
  if (data) {
    return { status: 'ok', data, refetch: () => void refetch() };
  }
  if (!online) {
    // Без мрежа и без кеш react-query само чака: казва се „Няма връзка“, а не се върти без край.
    return {
      status: 'error',
      error: NO_CONNECTION,
      retry: () => void refetch(),
    };
  }
  return { status: 'pending' };
}
