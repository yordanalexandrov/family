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

/** The meal a reminder's {@link notificationTag} is about; `null` for a tag of the menu or anything else. */
export function mealOfTag(tag: string): string | null {
  return /^(?:thaw|cook)-([0-9a-f-]{36})$/.exec(tag)?.[1] ?? null;
}

/** The menu of a week, with the sheet of a meal open when `mealId` is given. */
function menuUrl(weekStart: DateKey, mealId?: string): string {
  const query = new URLSearchParams({ week: weekStart });
  if (mealId) {
    query.set('meal', mealId);
  }
  return `/menu?${query}`;
}

/** Where a notification about the menu of a week opens. */
export function menuWeekUrl(weekStart: DateKey): string {
  return menuUrl(weekStart);
}

/** Where a notification about a meal opens: the menu of its week, with the sheet of that meal open. */
export function mealUrl(meal: { id: string; date: DateKey }): string {
  return menuUrl(weekStartOf(startOfDayInSofia(meal.date)), meal.id);
}
