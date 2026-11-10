import {
  type ContractRequestStatus,
  type DateKey,
  type Slot,
  type SuggestionRequest,
  TAG_LABELS_BG,
  withHint,
} from '@family/shared';
import { capitalize, formatShortDate, formatWeekday } from '../../lib/format';
import { shorten } from '../recipes/format';

/** „Закуска“, „Обяд“, „Вечеря“: етикетът на тага с главна буква. */
export function slotLabel(slot: Slot): string {
  return capitalize(TAG_LABELS_BG[slot]);
}

export const REQUEST_STATUS_LABELS: Record<ContractRequestStatus, string> = {
  pending: 'чака',
  done: 'готова',
  failed: 'неуспешна',
};

/**
 * Заявката накратко: „Вечеря · „нещо с пиле““, „Закуска, Обяд“, „Вечеря за ср 4.11“ от ястие в менюто (дълга подсказка
 * е отрязана).
 */
export function requestLabel({
  slots,
  hint,
  meal,
}: Pick<SuggestionRequest, 'slots' | 'hint' | 'meal'>): string {
  const what = slots.map(slotLabel).join(', ');
  return withHint(
    meal ? `${what} за ${mealDayLabel(meal.date)}` : what,
    hint && shorten(hint),
  );
}

/** „ср 4.11“: денят на ястието, за което е заявката. */
export function mealDayLabel(day: DateKey): string {
  return `${formatWeekday(day)} ${formatShortDate(day)}`;
}

/** Какво е търсено, за чакането и грешката: „Търсено: Вечеря · „нещо с пиле““. */
export function searchedLabel(
  request: Pick<SuggestionRequest, 'slots' | 'hint' | 'meal'>,
): string {
  return `Търсено: ${requestLabel(request)}`;
}
