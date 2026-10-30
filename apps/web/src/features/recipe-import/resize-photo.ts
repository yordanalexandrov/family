import {
  IMPORT_PHOTO_JPEG_QUALITY,
  IMPORT_PHOTO_MAX_SIDE,
  importPhotoLayout,
} from '@family/shared';
import { logger } from '../../logger';

/**
 * Снимката, готова за внасяне, по `importPhotoLayout` (същото прави и `import-smoke.ts`): до 2000 px по дългата
 * страна, изправена по EXIF ориентацията, като JPEG (по-малка заявка и по-бърз агент); дълъг скрийншот — четимо
 * широк и нарязан на до 8 части отгоре надолу. Картина, която браузърът не може да декодира (HEIC извън Safari),
 * отива както е — api-то и OpenClaw я приемат до 10 MB.
 */
export async function resizePhoto(photo: Blob): Promise<Blob[]> {
  return (
    (await withBitmap(photo, async (bitmap) => {
      const layout = importPhotoLayout(bitmap.width, bitmap.height);
      const parts: Blob[] = [];
      for (const tile of layout.tiles) {
        const jpeg = await drawJpeg(bitmap, {
          width: layout.width,
          height: layout.height,
          top: tile.top,
          canvasHeight: tile.height,
        });
        if (!jpeg) {
          return undefined;
        }
        parts.push(jpeg);
      }
      return parts;
    })) ?? [photo]
  );
}

/**
 * Снимка на стъпка (GLOSSARY), готова за качване: както при внасяне, до 2000 px по дългата страна, изправена, като
 * JPEG, но цялата, без нарязване на части. Картина, която браузърът не може да декодира (HEIC извън Safari), отива
 * както е: api-то я чете само.
 */
export async function resizeStepPhoto(photo: Blob): Promise<Blob> {
  return (
    (await withBitmap(photo, (bitmap) => {
      const scale = Math.min(
        1,
        IMPORT_PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height),
      );
      const width = Math.round(bitmap.width * scale);
      const height = Math.round(bitmap.height * scale);
      return drawJpeg(bitmap, { width, height, top: 0, canvasHeight: height });
    })) ?? photo
  );
}

/** `draw` с декодираната снимка; `undefined`, ако браузърът не я декодира или `draw` не успее. */
async function withBitmap<T>(
  photo: Blob,
  draw: (bitmap: ImageBitmap) => Promise<T | undefined | null>,
): Promise<T | undefined> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(photo);
  } catch (error) {
    logger.warn('photo not decoded, sent as it is', error);
    return undefined;
  }
  try {
    return (await draw(bitmap)) ?? undefined;
  } finally {
    bitmap.close();
  }
}

/** Снимката, нарисувана `width`×`height` от `top` надолу в платно `canvasHeight` високо, като JPEG. */
async function drawJpeg(
  bitmap: ImageBitmap,
  {
    width,
    height,
    top,
    canvasHeight,
  }: { width: number; height: number; top: number; canvasHeight: number },
): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = canvasHeight;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  context.drawImage(bitmap, 0, -top, width, height);
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', IMPORT_PHOTO_JPEG_QUALITY),
  );
}
