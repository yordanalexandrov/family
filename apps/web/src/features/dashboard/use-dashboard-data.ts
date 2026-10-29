import {
  type DashboardResponse,
  dashboardResponseSchema,
} from '@family/shared';
import { useDashboard } from '../../api/queries';
import { offlineCache } from '../../lib/offline-cache';
import {
  type OfflineCachedData,
  useOfflineCachedQuery,
} from '../../lib/use-offline-cached-query';

/*
 * Офлайн кеш на дашборда: последният успешен `GET /api/dashboard` и кога е взет.
 * Без мрежа, при мрежова грешка или 5xx екранът показва него с банер „Няма връзка със сървъра“.
 */
const cache = offlineCache(
  'family.dashboardCache',
  dashboardResponseSchema,
  'дашборда',
);

export type DashboardData = OfflineCachedData<DashboardResponse>;

/** `GET /api/dashboard` с офлайн кеша. */
export function useDashboardData(): DashboardData {
  return useOfflineCachedQuery(useDashboard(), cache);
}
