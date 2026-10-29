import {
  addDays,
  CALENDAR_MAX_DAYS,
  calendarEventsResponseSchema,
  type DateKey,
  type DayEvents,
} from '@family/shared';
import { useCalendarEvents } from '../../api/queries';
import { offlineCache } from '../../lib/offline-cache';
import {
  type OfflineCachedData,
  useOfflineCachedQuery,
} from '../../lib/use-offline-cached-query';

/*
 * Офлайн кеш на Календара като този на Дашборда: последните заредени дни и кога са взети.
 * Без мрежа или при мрежова грешка/5xx екранът показва тях от днес нататък с „остарели данни“.
 */
const cache = offlineCache(
  'family.calendarCache',
  calendarEventsResponseSchema.shape.days,
  'календара',
);

export type CalendarDays = OfflineCachedData<DayEvents[]>;

/** Дните на Календара от `today` (`GET /api/calendar/events`) с офлайн кеша. */
export function useCalendarDays(today: DateKey): CalendarDays {
  return useOfflineCachedQuery(
    useCalendarEvents(today, addDays(today, CALENDAR_MAX_DAYS)),
    cache,
    (days) => {
      const fromToday = days.filter((day) => day.date >= today);
      return fromToday.length > 0 ? fromToday : null;
    },
  );
}
