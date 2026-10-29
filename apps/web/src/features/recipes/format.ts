export const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/**
 * Времето за един поглед: до час — „45 мин“, „60 мин“; над това — „3 ч 45 мин“, „17 ч“; от денонощие нагоре — „1 ден“,
 * „2 дни 3 ч“ (минутите там не се четат).
 */
export function formatMinutes(minutes: number): string {
  if (minutes <= MINUTES_PER_HOUR) {
    return `${minutes} мин`;
  }
  if (minutes >= MINUTES_PER_DAY) {
    const days = Math.floor(minutes / MINUTES_PER_DAY);
    const hours = Math.floor((minutes % MINUTES_PER_DAY) / MINUTES_PER_HOUR);
    const dayPart = days === 1 ? '1 ден' : `${days} дни`;
    return hours > 0 ? `${dayPart} ${hours} ч` : dayPart;
  }
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;
  return rest > 0 ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

const dateFormat = new Intl.DateTimeFormat('bg-BG', {
  dateStyle: 'short',
  timeStyle: 'short',
});

export function formatDateTime(iso: string): string {
  return dateFormat.format(new Date(iso));
}

/** „recepti.example“ от линка на източника, без „www.“. */
export function sourceDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Текстът, отрязан до `max` знака по цяла дума, с „…“, ако е отрязан. */
export function shorten(text: string, max = 40): string {
  const chars = [...text];
  if (chars.length <= max) {
    return text;
  }
  const head = chars.slice(0, max).join('');
  const atWord =
    chars[max] === ' '
      ? head
      : head.slice(0, Math.max(head.lastIndexOf(' '), 0));
  return `${(atWord || head).trimEnd()}…`;
}

/** „1 продукт“, „3 продукта“. */
export function productCount(count: number): string {
  return count === 1 ? '1 продукт' : `${count} продукта`;
}
