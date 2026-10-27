import { IMPORT_PHOTO_JPEG_QUALITY, importPhotoLayout } from '@family/shared';
import { logger } from '../../logger';

/**
 * Снимката, готова за внасяне, по `importPhotoLayout` (същото прави и `import-smoke.ts`): до 2000 px по дългата
 * страна, изправена по EXIF ориентацията, като JPEG (по-малка заявка и по-бърз агент); дълъг скрийншот — четимо
 * широк и нарязан на до 8 части отгоре надолу. Картина, която браузърът не може да декодира (HEIC извън Safari),
 * отива както е — api-то и OpenClaw я приемат до 10 MB.
 */
export async function resizePhoto(photo: Blob): Promise<Blob[]> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(photo);
  } catch (error) {
    logger.warn('photo not decoded, sent as it is', error);
    return [photo];
  }
  try {
    const layout = importPhotoLayout(bitmap.width, bitmap.height);
    const parts: Blob[] = [];
    for (const tile of layout.tiles) {
      const canvas = document.createElement('canvas');
      canvas.width = layout.width;
      canvas.height = tile.height;
      const context = canvas.getContext('2d');
      if (!context) {
        return [photo];
      }
      context.drawImage(bitmap, 0, -tile.top, layout.width, layout.height);
      const jpeg = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', IMPORT_PHOTO_JPEG_QUALITY),
      );
      if (!jpeg) {
        return [photo];
      }
      parts.push(jpeg);
    }
    return parts;
  } finally {
    bitmap.close();
  }
}
