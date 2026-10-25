import { QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import { logger } from '../logger';
import { clearActingUserId } from './acting-user';

type Retry = boolean | ((failureCount: number, error: Error) => boolean);

/** Един опит повече само при мрежова/сървърна грешка; 4xx не се повтаря. */
function defaultRetry(failureCount: number, error: Error): boolean {
  if (error instanceof ApiError && !error.isServerError()) {
    return false;
  }
  return failureCount < 1;
}

export function createQueryClient({
  retry = defaultRetry,
}: {
  retry?: Retry;
} = {}) {
  return new QueryClient({
    queryCache: new QueryCache({
      onError(error, query) {
        // Която и да е заявка: потребителят на устройството вече го няма в api, затова изборът се чисти
        // и root layout-ът води към „Кой си?“.
        if (error instanceof ApiError && error.isUnknownActingUser()) {
          clearActingUserId();
        }
        logger.warn('Заявката не успя', query.queryKey, error);
      },
    }),
    defaultOptions: {
      queries: { retry },
    },
  });
}
