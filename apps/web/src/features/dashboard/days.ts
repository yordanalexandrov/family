import type { DateKey, DayEvents } from '@family/shared';

/**
 * Днешният ден по часовника на устройството и дните след него. След полунощ, докато
 * новите данни не са дошли (или офлайн, от кеша), вчерашният ден не се показва като
 * днешен; ден, който го няма в данните, е без събития.
 */
export function splitDays(
  days: DayEvents[],
  today: DateKey,
): { today: DayEvents; nextDays: DayEvents[] } {
  return {
    today: days.find((day) => day.date === today) ?? {
      date: today,
      events: [],
    },
    nextDays: days.filter((day) => day.date > today),
  };
}
