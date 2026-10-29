import { logger } from '../logger';

/*
 * Офлайн кеш на един екран в localStorage: последният успешен отговор и кога е взет.
 * При мрежова грешка или без мрежа екранът показва него с жълт надпис.
 */

export interface Cached<T> {
  data: T;
  fetchedAt: Date;
}

export interface OfflineCache<T> {
  write(data: T, fetchedAt: Date): void;
  /** Записаният отговор; `null`, ако няма или вече не е по договора. */
  read(): Cached<T> | null;
}

/** Проверката на записаното: zod схема от `@family/shared`. */
interface CacheSchema<T> {
  safeParse(input: unknown): { success: true; data: T } | { success: false };
}

export function offlineCache<T>(
  key: string,
  schema: CacheSchema<T>,
  name: string,
): OfflineCache<T> {
  return {
    write(data, fetchedAt) {
      try {
        localStorage.setItem(
          key,
          JSON.stringify({ fetchedAt: fetchedAt.toISOString(), data }),
        );
      } catch (error) {
        logger.warn(`Кешът на ${name} не се записа`, error);
      }
    },
    read() {
      try {
        const raw = localStorage.getItem(key);
        if (raw === null) {
          return null;
        }
        const parsed = JSON.parse(raw) as {
          fetchedAt?: unknown;
          data?: unknown;
        };
        const data = schema.safeParse(parsed.data);
        const fetchedAt = new Date(String(parsed.fetchedAt));
        if (!data.success || Number.isNaN(fetchedAt.getTime())) {
          return null;
        }
        return { data: data.data, fetchedAt };
      } catch (error) {
        logger.warn(`Кешът на ${name} не се прочете`, error);
        return null;
      }
    },
  };
}
