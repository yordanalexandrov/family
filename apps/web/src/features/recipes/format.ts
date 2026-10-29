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
