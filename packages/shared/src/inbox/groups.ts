import { addDays, dateKeyInSofia } from '../dashboard/time.js';

/** The groups of the inbox (GLOSSARY: Входяща кутия), by the Sofia day of the item's last update. */
export type InboxGroupLabel = 'Днес' | 'Вчера' | 'По-рано';

export interface InboxGroup<T> {
  label: InboxGroupLabel;
  items: T[];
}

/**
 * The inbox items in „Днес“, „Вчера“ and „По-рано“ by the Sofia day of `updatedAt` at `now`, each group in the order of
 * `items` (the api's, the newest first); a group without items is left out.
 */
export function inboxGroups<T extends { updatedAt: string }>(
  items: T[],
  now: Date,
): InboxGroup<T>[] {
  const today = dateKeyInSofia(now);
  const yesterday = addDays(today, -1);
  const groups: InboxGroup<T>[] = [
    { label: 'Днес', items: [] },
    { label: 'Вчера', items: [] },
    { label: 'По-рано', items: [] },
  ];
  for (const item of items) {
    const day = dateKeyInSofia(new Date(item.updatedAt));
    const index = day >= today ? 0 : day === yesterday ? 1 : 2;
    groups[index]?.items.push(item);
  }
  return groups.filter((group) => group.items.length > 0);
}
