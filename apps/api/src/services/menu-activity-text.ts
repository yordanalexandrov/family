import { type InboxDetail, type VoteValue, weekdayName } from '@family/shared';
import type { MenuActivityAction } from '../db/repositories/menu-activity.js';
import { mealUrl } from './notification-links.js';

/** Who did an action the notification can no longer name (they are not a person any more). */
const SOMEONE = 'Някой';

/** What a vote put records as menu activity, after the voter's name: „гласува за „Мусака““; no quotes without a title. */
export function voteText(value: VoteValue, title: string | null): string {
  const verb = `гласува ${value === 'up' ? 'за' : 'против'}`;
  return title ? `${verb} „${title}“` : verb;
}

/** The title of the notification (GLOSSARY: Известие от Съгласуването): the people who acted, „Поли по менюто“. */
export function activityTitle(
  actions: readonly MenuActivityAction[],
  people: readonly { id: string; name: string }[],
): string {
  const actors = people
    .filter((person) => actions.some((a) => a.actorUserId === person.id))
    .map((person) => person.name)
    .join(' и ');
  return `${actors || SOMEONE} по менюто`;
}

/**
 * The details of the notification: each action under its day, the days in order and the actions of a day in the order
 * they were done, each opening its meal in the menu of the week: „Вторник: Поли смени „Пиле“ → „Мусака““.
 */
export function activityDetails(
  actions: readonly MenuActivityAction[],
  names: ReadonlyMap<string, string>,
): InboxDetail[] {
  // A stable sort: the actions come in the order they were done.
  return [...actions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((action) => {
      const day = weekdayName(action.date);
      const who = names.get(action.actorUserId) || SOMEONE;
      return {
        text: `${day.charAt(0).toUpperCase()}${day.slice(1)}: ${who} ${action.text}`,
        url: mealUrl({ id: action.mealId, date: action.date }),
      };
    });
}
