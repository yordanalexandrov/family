import decodeHeic from 'heic-decode';
import sharp, { type Sharp } from 'sharp';
import { UnsupportedPhotoError } from './errors.js';
import { photoType } from './recipe-photo.js';

const JPEG_QUALITY = 82;

const NOT_A_PHOTO = 'Това не е снимка (JPEG, PNG, WebP или HEIC).';

/**
 * The most pixels a photo may have to be read (50 megapixels: a 48 MP phone photo fits). A small file can declare a
 * huge picture (a PNG of one colour, a HEIC whose header lies), so this is checked before it is decoded.
 */
export const PHOTO_MAX_INPUT_PIXELS = 50_000_000;

const TOO_MANY_PIXELS = `Снимката е над ${PHOTO_MAX_INPUT_PIXELS / 1_000_000} мегапиксела. Опитай с по-малка.`;

/**
 * A photo as the api keeps it (a step photo, ADR-0008; a photo of a recipe source, ADR-0016): the type is read from the
 * bytes (JPEG, PNG, WebP, HEIC/HEIF), then the photo is turned upright by its EXIF orientation, made at most `maxSide`
 * on the long side and written as a JPEG without EXIF (no GPS). Anything else, a picture that does not decode or one
 * over {@link PHOTO_MAX_INPUT_PIXELS}, is an `UnsupportedPhotoError`. Slow (decoding): never inside a transaction.
 */
export async function keptJpeg(
  bytes: Buffer,
  maxSide: number,
): Promise<Buffer> {
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
        width: maxSide,
        height: maxSide,
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

/** A kept photo, or with `width` a thumbnail that wide made now (never wider than the photo). Always a JPEG. */
export async function jpegOfWidth(
  data: Buffer,
  width: number | undefined,
): Promise<Buffer> {
  if (width === undefined) {
    return data;
  }
  return sharp(data)
    .resize({ width, withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

/**
 * The picture for sharp, refused over {@link PHOTO_MAX_INPUT_PIXELS} by its header. sharp's own libvips reads no HEVC,
 * so a HEIC comes in as pixels from libheif, which has already turned it upright by its own transforms (`irot`,
 * `imir`); its declared size is checked before libheif makes room for the pixels.
 */
async function decoded(bytes: Buffer, heic: boolean): Promise<Sharp> {
  if (!heic) {
    return sharp(bytes, {
      failOn: 'error',
      limitInputPixels: PHOTO_MAX_INPUT_PIXELS,
    });
  }
  const images = await decodeHeic.all({ buffer: bytes });
  try {
    const [main] = images;
    if (!main) {
      throw new UnsupportedPhotoError(NOT_A_PHOTO);
    }
    if (main.width * main.height > PHOTO_MAX_INPUT_PIXELS) {
      throw new UnsupportedPhotoError(TOO_MANY_PIXELS);
    }
    const { width, height, data } = await main.decode();
    return sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
      raw: { width, height, channels: 4 },
      limitInputPixels: PHOTO_MAX_INPUT_PIXELS,
    });
  } finally {
    images.dispose();
  }
}
