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

const dateFormat = new Intl.DateTimeFormat('bg-BG', {
  dateStyle: 'short',
  timeStyle: 'short',
});

export function formatDateTime(iso: string): string {
  return dateFormat.format(new Date(iso));
}

/** „recepti.example“ от линка на източника. */
export function sourceDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** „1 продукт“, „3 продукта“. */
export function productCount(count: number): string {
  return count === 1 ? '1 продукт' : `${count} продукта`;
}
