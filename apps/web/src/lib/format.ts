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

/**
 * Сума във валутата на Wallet, без дробна част: „370 €“; сума, която би станала 0 (но не е 0), е със стотинки,
 * „-0,30 €“, за да няма „-0 €“. Никъде твърдо „лв“. Двата лимита на дробната част са
 * изрично заедно: само `maximumFractionDigits: 0` е RangeError в по-старите браузъри
 * (TV), защото минимумът по подразбиране за EUR е 2.
 */
export function formatMoney(amount: number, currency: string): string {
  const fractionDigits = amount !== 0 && Math.abs(amount) < 0.5 ? 2 : 0;
  return new Intl.NumberFormat('bg-BG', {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}

/** „1 порция“, „3 порции“, „0 порции“. */
export function formatServings(count: number): string {
  return count === 1 ? '1 порция' : `${count} порции`;
}
