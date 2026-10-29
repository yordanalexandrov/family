import {
  type ContractRequestStatus,
  type Slot,
  type SuggestionRequest,
  TAG_LABELS_BG,
  withHint,
} from '@family/shared';
import { capitalize } from '../../lib/format';
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

/** Какво е търсено, за чакането и грешката: „Търсено: Вечеря · „нещо с пиле““ (дълга подсказка е отрязана). */
export function searchedLabel({
  slots,
  hint,
}: Pick<SuggestionRequest, 'slots' | 'hint'>): string {
  const what = slots.map(slotLabel).join(', ');
  return withHint(`Търсено: ${what}`, hint && shorten(hint));
}
