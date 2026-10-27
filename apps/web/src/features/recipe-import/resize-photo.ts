import {
  IMPORT_PHOTO_JPEG_QUALITY,
  IMPORT_PHOTO_MAX_SIDE,
} from '@family/shared';
import { logger } from '../../logger';

/** Размерите на картина `width`×`height`, смалена пропорционално до най-много `max` по дългата страна. */
export function fitWithin(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

/**
 * Снимката, готова за внасяне: до 2000 px по дългата страна, изправена по EXIF ориентацията, като JPEG (по-малка
 * заявка и по-бърз агент; тези числа ползва и `import-smoke.ts`). Картина, която браузърът не може да декодира
 * (HEIC извън Safari), отива както е — api-то и OpenClaw я приемат до 10 MB.
 */
export async function resizePhoto(photo: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(photo);
  } catch (error) {
    logger.warn('photo not decoded, sent as it is', error);
    return photo;
  }
  try {
    const { width, height } = fitWithin(
      bitmap.width,
      bitmap.height,
      IMPORT_PHOTO_MAX_SIDE,
    );
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      return photo;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    const jpeg = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', IMPORT_PHOTO_JPEG_QUALITY),
    );
    return jpeg ?? photo;
  } finally {
    bitmap.close();
  }
}
