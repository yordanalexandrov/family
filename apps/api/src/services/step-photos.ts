import { STEP_PHOTO_MAX_SIDE } from '@family/shared';
import decodeHeic from 'heic-decode';
import sharp, { type Sharp } from 'sharp';
import type { DbExecutor } from '../db/client.js';
import {
  findStepPhotoData,
  insertStepPhoto,
} from '../db/repositories/step-photos.js';
import { NotFoundError, UnsupportedPhotoError } from './errors.js';
import { photoType } from './recipe-photo.js';

const JPEG_QUALITY = 82;

const NOT_A_PHOTO = 'Това не е снимка (JPEG, PNG, WebP или HEIC).';

/**
 * GLOSSARY: Снимка на стъпка (ADR-0008). Stores a photo of a step from any source (the recipe form, a recipe page)
 * and returns its id: the type is read from the bytes (JPEG, PNG, WebP, HEIC/HEIF), then the photo is turned upright by
 * its EXIF orientation, made at most `STEP_PHOTO_MAX_SIDE` on the long side and written as a JPEG without EXIF (no GPS).
 * Anything else, or a picture that does not decode, is an `UnsupportedPhotoError`.
 */
export async function storeStepPhoto(
  db: DbExecutor,
  bytes: Buffer,
): Promise<string> {
  const jpeg = await uprightJpeg(bytes);
  return insertStepPhoto(db, jpeg);
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

async function uprightJpeg(bytes: Buffer): Promise<Buffer> {
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
    throw new UnsupportedPhotoError(NOT_A_PHOTO);
  }
}

/**
 * The picture for sharp. sharp's own libvips reads no HEVC, so a HEIC comes in as pixels from libheif, which has
 * already turned it upright by its own transforms (`irot`, `imir`).
 */
async function decoded(bytes: Buffer, heic: boolean): Promise<Sharp> {
  if (!heic) {
    return sharp(bytes, { failOn: 'error' });
  }
  const { width, height, data } = await decodeHeic({ buffer: bytes });
  return sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
    raw: { width, height, channels: 4 },
  });
}
