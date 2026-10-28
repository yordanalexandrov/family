import { type DateKey, startOfDayInSofia, weekStartOf } from '@family/shared';

/**
 * The tag of a notification (GLOSSARY: Известие): on a device, a newer one with the same tag takes the place of the
 * older. One per meal for its reminders, one per week for the menu.
 */
export const notificationTag = {
  thaw: (mealId: string) => `thaw-${mealId}`,
  cook: (mealId: string) => `cook-${mealId}`,
  menu: (weekStart: DateKey) => `menu-${weekStart}`,
};

/** Where a notification about the menu of a week opens. */
export function menuWeekUrl(weekStart: DateKey): string {
  return `/menu?week=${weekStart}`;
}

/** Where a notification about a meal on `date` opens: the menu of its week, as the web has no parameter for a day. */
export function mealDayUrl(date: DateKey): string {
  return menuWeekUrl(weekStartOf(startOfDayInSofia(date)));
}
