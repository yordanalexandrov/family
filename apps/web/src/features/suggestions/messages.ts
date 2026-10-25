import {
  type Slot,
  type SuggestionRequestStatus,
  TAG_LABELS_BG,
} from '@family/shared';

/** „Закуска“, „Обяд“, „Вечеря“: етикетът на тага с главна буква. */
export function slotLabel(slot: Slot): string {
  const label = TAG_LABELS_BG[slot];
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export const REQUEST_STATUS_LABELS: Record<SuggestionRequestStatus, string> = {
  pending: 'чака',
  done: 'готова',
  failed: 'неуспешна',
};
