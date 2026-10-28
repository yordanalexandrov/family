import {
  type ContractRequestStatus,
  type Slot,
  TAG_LABELS_BG,
} from '@family/shared';
import { capitalize } from '../../lib/format';

/** „Закуска“, „Обяд“, „Вечеря“: етикетът на тага с главна буква. */
export function slotLabel(slot: Slot): string {
  return capitalize(TAG_LABELS_BG[slot]);
}

export const REQUEST_STATUS_LABELS: Record<ContractRequestStatus, string> = {
  pending: 'чака',
  done: 'готова',
  failed: 'неуспешна',
};
