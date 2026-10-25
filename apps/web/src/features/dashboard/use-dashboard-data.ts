import type { DashboardResponse } from '@family/shared';
import { useEffect, useMemo } from 'react';
import { ApiError } from '../../api/client';
import { useDashboard } from '../../api/queries';
import { readDashboardCache, writeDashboardCache } from './cache';

export type DashboardData =
  | { status: 'pending' }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'ok'; data: DashboardResponse; refetch: () => void }
  /** Сървърът не отговаря: последният успешен отговор от кеша. */
  | {
      status: 'offline';
      data: DashboardResponse;
      fetchedAt: Date;
      refetch: () => void;
    };

/** Мрежова грешка или 5xx: същата заявка може да мине след малко; 4xx няма да мине. */
function isConnectionError(error: unknown): boolean {
  return !(error instanceof ApiError) || error.isServerError();
}

/** `GET /api/dashboard` с офлайн кеша: пише всеки успешен отговор, чете го при връзка, която не става. */
export function useDashboardData(): DashboardData {
  const query = useDashboard();
  const { data, dataUpdatedAt, error, errorUpdatedAt, refetch } = query;

  useEffect(() => {
    if (data) {
      writeDashboardCache(data, new Date(dataUpdatedAt));
    }
  }, [data, dataUpdatedAt]);

  const offline = query.isError && isConnectionError(error);
  // biome-ignore lint/correctness/useExhaustiveDependencies: при всяка нова грешка кешът се чете наново
  const cached = useMemo(
    () => (offline ? readDashboardCache() : null),
    [offline, errorUpdatedAt],
  );

  if (cached) {
    return {
      status: 'offline',
      data: cached.data,
      fetchedAt: cached.fetchedAt,
      refetch: () => void refetch(),
    };
  }
  if (query.isError) {
    return { status: 'error', error, retry: () => void refetch() };
  }
  if (data) {
    return { status: 'ok', data, refetch: () => void refetch() };
  }
  return { status: 'pending' };
}
