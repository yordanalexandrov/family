import { logger } from '../logger';

/**
 * Badging API: `navigator` на приложението и на service worker-а. Без поддръжка (Firefox, iOS извън инсталирано PWA)
 * методите ги няма.
 */
export interface AppBadge {
  setAppBadge?(count: number): Promise<void>;
  clearAppBadge?(): Promise<void>;
}

/** Дали `target` има Badging API. */
export function canBadge(target: AppBadge): boolean {
  return typeof target.setAppBadge === 'function';
}

/**
 * Бройката на непрочетените (GLOSSARY: Входяща кутия) върху иконата на приложението; `0` я маха. Без Badging API или
 * при отказ на браузъра нищо не се случва: иконата е удобство, не информация.
 */
export async function showAppBadge(
  target: AppBadge,
  count: number,
): Promise<void> {
  try {
    if (count > 0) {
      await target.setAppBadge?.(count);
    } else {
      await target.clearAppBadge?.();
    }
  } catch (error) {
    logger.warn('Бройката на иконата не се обнови', error);
  }
}
