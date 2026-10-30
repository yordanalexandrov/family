import {
  DAY_MS,
  HOUR_MS,
  type RecipeStep,
  STEP_PHOTO_MAX_SIDE,
  startOfDayInSofia,
} from '@family/shared';
import decodeHeic from 'heic-decode';
import sharp, { type Sharp } from 'sharp';
import type { DbExecutor } from '../db/client.js';
import {
  deleteOrphanStepPhotos,
  findStepPhotoData,
  insertStepPhoto,
} from '../db/repositories/step-photos.js';
import { NotFoundError, UnsupportedPhotoError } from './errors.js';
import { photoType } from './recipe-photo.js';

const JPEG_QUALITY = 82;

/** The night hours in Sofia when the cron removes orphans: an edit given up in the evening loses nothing till morning. */
const ORPHAN_CLEANUP_HOURS = { from: 3, to: 5 };

/** A photo is uploaded when chosen and pointed at only on „Запази“, so a younger orphan may be an edit under way. */
const ORPHAN_MIN_AGE_MS = DAY_MS;

/**
 * The cron's `step-photo-orphans` (`plugins/scheduler.ts`): at night in Sofia ({@link ORPHAN_CLEANUP_HOURS}) deletes
 * every step photo older than a day that no recipe and no proposed suggestion points at, and answers how many; by day
 * it does nothing and answers `null`. Running it again the same night deletes nothing more.
 */
export async function removeOrphanStepPhotos(
  db: DbExecutor,
  now: Date,
): Promise<number | null> {
  const hour = (now.getTime() - startOfDayInSofia(now).getTime()) / HOUR_MS;
  if (hour < ORPHAN_CLEANUP_HOURS.from || hour >= ORPHAN_CLEANUP_HOURS.to) {
    return null;
  }
  return deleteOrphanStepPhotos(
    db,
    new Date(now.getTime() - ORPHAN_MIN_AGE_MS),
  );
}

/** The photos `steps` point at, each once, in the order of the steps. */
export function stepPhotoIds(steps: readonly RecipeStep[]): string[] {
  return [...new Set(steps.flatMap((step) => step.photoId ?? []))];
}

const NOT_A_PHOTO = 'Това не е снимка (JPEG, PNG, WebP или HEIC).';

/**
 * The most pixels a step photo may have to be read (50 megapixels: a 48 MP phone photo fits). A small file can declare
 * a huge picture (a PNG of one colour, a HEIC whose header lies), so this is checked before it is decoded.
 */
export const STEP_PHOTO_MAX_INPUT_PIXELS = 50_000_000;

const TOO_MANY_PIXELS = `Снимката е над ${STEP_PHOTO_MAX_INPUT_PIXELS / 1_000_000} мегапиксела. Опитай с по-малка.`;

/**
 * GLOSSARY: Снимка на стъпка (ADR-0008). Stores a photo of a step uploaded by the recipe form and returns its id; the
 * photo is made ready by {@link stepPhotoJpeg} first.
 */
export async function storeStepPhoto(
  db: DbExecutor,
  bytes: Buffer,
): Promise<string> {
  return insertStepPhoto(db, await stepPhotoJpeg(bytes));
}

/**
 * A photo of a step from any source (the recipe form, a recipe page) as the api keeps it: the type is read from the
 * bytes (JPEG, PNG, WebP, HEIC/HEIF), then the photo is turned upright by its EXIF orientation, made at most
 * `STEP_PHOTO_MAX_SIDE` on the long side and written as a JPEG without EXIF (no GPS). Anything else, a picture that
 * does not decode or one over {@link STEP_PHOTO_MAX_INPUT_PIXELS}, is an `UnsupportedPhotoError`. Slow (decoding):
 * never inside a transaction.
 */
export async function stepPhotoJpeg(bytes: Buffer): Promise<Buffer> {
  const type = photoType(bytes);
  if (!type) {
    throw new UnsupportedPhotoError(NOT_A_PHOTO);
  }
  try {
    const image = await decoded(
      bytes,
      type === 'image/heic' || type === 'image/heif',
    );
    return await image
      .rotate()
      .resize({
        width: STEP_PHOTO_MAX_SIDE,
        height: STEP_PHOTO_MAX_SIDE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      // A transparent PNG or WebP on white, not black.
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
  } catch (error) {
    if (error instanceof UnsupportedPhotoError) {
      throw error;
    }
    if (error instanceof Error && /pixel limit/i.test(error.message)) {
      throw new UnsupportedPhotoError(TOO_MANY_PIXELS);
    }
    throw new UnsupportedPhotoError(NOT_A_PHOTO);
  }
}

/**
 * The stored photo, or with `width` a thumbnail that wide made now (never wider than the photo); an unknown id is a
 * `NotFoundError`. Always a JPEG.
 */
export async function stepPhotoImage(
  db: DbExecutor,
  id: string,
  width?: number,
): Promise<Buffer> {
  const data = await findStepPhotoData(db, id);
  if (!data) {
    throw new NotFoundError('Няма такава снимка');
  }
  if (width === undefined) {
    return data;
  }
  return sharp(data)
    .resize({ width, withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

/**
 * The picture for sharp, refused over {@link STEP_PHOTO_MAX_INPUT_PIXELS} by its header. sharp's own libvips reads no
 * HEVC, so a HEIC comes in as pixels from libheif, which has already turned it upright by its own transforms (`irot`,
 * `imir`); its declared size is checked before libheif makes room for the pixels.
 */
async function decoded(bytes: Buffer, heic: boolean): Promise<Sharp> {
  if (!heic) {
    return sharp(bytes, {
      failOn: 'error',
      limitInputPixels: STEP_PHOTO_MAX_INPUT_PIXELS,
    });
  }
  const images = await decodeHeic.all({ buffer: bytes });
  try {
    const [main] = images;
    if (!main) {
      throw new UnsupportedPhotoError(NOT_A_PHOTO);
    }
    if (main.width * main.height > STEP_PHOTO_MAX_INPUT_PIXELS) {
      throw new UnsupportedPhotoError(TOO_MANY_PIXELS);
    }
    const { width, height, data } = await main.decode();
    return sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
      raw: { width, height, channels: 4 },
      limitInputPixels: STEP_PHOTO_MAX_INPUT_PIXELS,
    });
  } finally {
    images.dispose();
  }
}
