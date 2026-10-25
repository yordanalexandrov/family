import {
  type DateKey,
  FAMILY_TIME_ZONE,
  startOfDayInSofia,
} from '@family/shared';

const timeFormat = new Intl.DateTimeFormat('bg-BG', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: FAMILY_TIME_ZONE,
});

const dayLongFormat = new Intl.DateTimeFormat('bg-BG', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: FAMILY_TIME_ZONE,
});

const weekdayFormat = new Intl.DateTimeFormat('bg-BG', {
  weekday: 'short',
  timeZone: FAMILY_TIME_ZONE,
});

const dateFormat = new Intl.DateTimeFormat('bg-BG', {
  day: 'numeric',
  month: 'long',
  timeZone: FAMILY_TIME_ZONE,
});

/** „18:30“: 24-часово, в София. */
export function formatTime(instant: Date | string): string {
  return timeFormat.format(new Date(instant));
}

/** „сряда, 4 ноември“. */
export function formatDayLong(day: DateKey | Date): string {
  return dayLongFormat.format(toInstant(day));
}

/** „ср“. */
export function formatWeekday(day: DateKey): string {
  return weekdayFormat.format(toInstant(day));
}

/** „4 ноември“. */
export function formatDate(day: DateKey): string {
  return dateFormat.format(toInstant(day));
}

function toInstant(day: DateKey | Date): Date {
  return typeof day === 'string' ? startOfDayInSofia(day) : day;
}

/** Сума във валутата на Wallet, без дробна част: „370 €“. Никъде твърдо „лв“. */
export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('bg-BG', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
