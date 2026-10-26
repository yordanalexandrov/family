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
