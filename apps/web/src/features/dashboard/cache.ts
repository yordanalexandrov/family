import {
  type DashboardResponse,
  dashboardResponseSchema,
} from '@family/shared';
import { logger } from '../../logger';

/*
 * Офлайн кеш на дашборда: последният успешен `GET /api/dashboard` и кога е взет.
 * При мрежова грешка или 5xx екранът показва него с банер „Няма връзка със сървъра“.
 */
export const DASHBOARD_CACHE_KEY = 'family.dashboardCache';

export interface CachedDashboard {
  data: DashboardResponse;
  fetchedAt: Date;
}

export function writeDashboardCache(
  data: DashboardResponse,
  fetchedAt: Date,
): void {
  try {
    localStorage.setItem(
      DASHBOARD_CACHE_KEY,
      JSON.stringify({ fetchedAt: fetchedAt.toISOString(), data }),
    );
  } catch (error) {
    logger.warn('Кешът на дашборда не се записа', error);
  }
}

/** Записаният отговор; `null`, ако няма или вече не е по договора. */
export function readDashboardCache(): CachedDashboard | null {
  try {
    const raw = localStorage.getItem(DASHBOARD_CACHE_KEY);
    if (raw === null) {
      return null;
    }
    const parsed = JSON.parse(raw) as { fetchedAt?: unknown; data?: unknown };
    const data = dashboardResponseSchema.safeParse(parsed.data);
    const fetchedAt = new Date(String(parsed.fetchedAt));
    if (!data.success || Number.isNaN(fetchedAt.getTime())) {
      return null;
    }
    return { data: data.data, fetchedAt };
  } catch (error) {
    logger.warn('Кешът на дашборда не се прочете', error);
    return null;
  }
}
