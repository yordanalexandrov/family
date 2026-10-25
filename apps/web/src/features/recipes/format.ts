import { type RecipeLine, UNIT_LABELS_BG } from '@family/shared';

const numberFormat = new Intl.NumberFormat('bg-BG', {
  maximumFractionDigits: 3,
});

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

/** „500 г“, „2 бр.“, „по вкус“; без количество — само единицата не се показва. */
export function formatQuantity(line: Pick<RecipeLine, 'quantity' | 'unit'>) {
  if (line.unit === 'pinch') {
    return UNIT_LABELS_BG.pinch;
  }
  if (line.quantity === null) {
    return '';
  }
  return `${formatNumber(line.quantity)} ${UNIT_LABELS_BG[line.unit]}`;
}

export function formatMinutes(minutes: number): string {
  return `${minutes} мин`;
}
