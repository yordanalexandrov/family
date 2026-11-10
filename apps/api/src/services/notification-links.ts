import { type DateKey, startOfDayInSofia, weekStartOf } from '@family/shared';

/** The reminders about a meal, each with its own tag; the meal is read back from it with {@link mealOfTag}. */
const MEAL_TAG_KINDS = ['thaw', 'cook'] as const;

function mealTag(kind: (typeof MEAL_TAG_KINDS)[number], mealId: string) {
  return `${kind}-${mealId}`;
}

/**
 * The tag of a notification (GLOSSARY: Известие): on a device, a newer one with the same tag takes the place of the
 * older. One per meal for its reminders, one per week for the menu.
 */
export const notificationTag = {
  thaw: (mealId: string) => mealTag('thaw', mealId),
  cook: (mealId: string) => mealTag('cook', mealId),
  menu: (weekStart: DateKey) => `menu-${weekStart}`,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The meal a reminder's {@link notificationTag} is about; `null` for a tag of the menu or anything else. */
export function mealOfTag(tag: string): string | null {
  for (const kind of MEAL_TAG_KINDS) {
    const prefix = mealTag(kind, '');
    const mealId = tag.slice(prefix.length);
    if (tag.startsWith(prefix) && UUID.test(mealId)) {
      return mealId;
    }
  }
  return null;
}

/** Where a detail about the pantry opens („Във фризера: …“). */
export function pantryUrl(): string {
  return '/pantry';
}

/** Where a detail about a recipe opens. */
export function recipeUrl(recipeId: string): string {
  return `/recipes/${recipeId}`;
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
