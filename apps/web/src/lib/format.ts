import {
  type DateKey,
  FAMILY_TIME_ZONE,
  type RecipeLine,
  startOfDayInSofia,
  UNIT_LABELS_BG,
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

const shortDateFormat = new Intl.DateTimeFormat('bg-BG', {
  day: 'numeric',
  month: 'numeric',
  timeZone: FAMILY_TIME_ZONE,
});

const dateFormat = new Intl.DateTimeFormat('bg-BG', {
  day: 'numeric',
  month: 'long',
  timeZone: FAMILY_TIME_ZONE,
});

/** Първата буква главна: „пн“ → „Пн“, „вечеря“ → „Вечеря“. */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

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

const SHORT_MONTHS = [
  'ян',
  'февр',
  'март',
  'апр',
  'май',
  'юни',
  'юли',
  'авг',
  'септ',
  'окт',
  'ноем',
  'дек',
] as const;

/** „2–8 ноем“, „26 окт – 1 ноем“: дните от `from` до `to` с кратък месец, за един ред. */
export function formatShortRange(from: DateKey, to: DateKey): string {
  const [, fromMonth, fromDay] = from.split('-').map(Number);
  const [, toMonth, toDay] = to.split('-').map(Number);
  const month = (m: number | undefined) => SHORT_MONTHS[(m ?? 1) - 1];
  return fromMonth === toMonth
    ? `${fromDay}–${toDay} ${month(toMonth)}`
    : `${fromDay} ${month(fromMonth)} – ${toDay} ${month(toMonth)}`;
}

/** „2.11“: ден и месец с числа, за тясна колона. */
export function formatShortDate(day: DateKey): string {
  return shortDateFormat.format(toInstant(day));
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

const numberFormat = new Intl.NumberFormat('bg-BG', {
  maximumFractionDigits: 3,
});

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

/** Няколко количества в мерни единици, които не се превръщат една в друга: „3 бр. + 750 г“. */
export function formatAmounts(
  amounts: Pick<RecipeLine, 'quantity' | 'unit'>[],
): string {
  return amounts
    .map(formatQuantity)
    .filter((text) => text !== '')
    .join(' + ');
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
