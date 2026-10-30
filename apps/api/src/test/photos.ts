import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { DANI } from './users.js';

/**
 * A HEIC photo as an iPhone sends it: 2000×1500, the left half red, the right half blue. Made for the purpose with
 * `pillow-heif` (x265), since sharp's own libvips cannot write (or read) HEVC (`src/test/fixtures/step-photos/`).
 */
export const HEIC_PHOTO = readFileSync(
  new URL('./fixtures/step-photos/step.heic', import.meta.url),
);

/** The side of a {@link hugePng} or {@link hugeHeic}: 8000×8000 is 64 megapixels, over what the api decodes. */
export const HUGE_SIDE = 8000;

/** A plain white PNG of {@link HUGE_SIDE}² pixels: about 200 KB of file, 192 MB as pixels. */
export function hugePng(): Promise<Buffer> {
  return sharp({
    create: {
      width: HUGE_SIDE,
      height: HUGE_SIDE,
      channels: 3,
      background: '#fff',
    },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * {@link HEIC_PHOTO} with its `ispe` box (the size the file declares) set to {@link HUGE_SIDE}²: a file of 1.2 KB that
 * libheif would decode into 256 MB of pixels before it notices the picture is smaller.
 */
export function hugeHeic(): Buffer {
  const heic = Buffer.from(HEIC_PHOTO);
  const ispe = heic.indexOf('ispe');
  // Box type, then 4 bytes of version and flags, then width and height.
  heic.writeUInt32BE(HUGE_SIDE, ispe + 8);
  heic.writeUInt32BE(HUGE_SIDE, ispe + 12);
  return heic;
}

/**
 * A JPEG as a phone camera writes it: `width`×`height` pixels as stored, with an EXIF orientation (6 = turn 90° to the
 * right to show it upright) and GPS coordinates in its EXIF.
 */
export function cameraJpeg({
  width = 2400,
  height = 1200,
  orientation = 1,
}: {
  width?: number;
  height?: number;
  orientation?: number;
} = {}): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: '#c33' },
  })
    .jpeg()
    .withExif({
      IFD0: { Make: 'Phone' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '42/1 41/1 0/1' },
    })
    .withMetadata({ orientation })
    .toBuffer();
}

/** `POST /api/step-photos` as the recipe form sends a photo: multipart with one file in the field `photo`. */
export function postStepPhoto(
  app: FastifyInstance,
  bytes: Uint8Array,
  { type = 'image/jpeg', field = 'photo' } = {},
) {
  const form = new FormData();
  form.append(field, new Blob([bytes], { type }), 'photo.jpg');
  return app.inject({
    method: 'POST',
    url: '/api/step-photos',
    headers: { 'x-acting-user': DANI.id },
    payload: form,
  });
}

/** A stored step photo's id (a small camera JPEG), for a step to point at. */
export async function storedStepPhoto(app: FastifyInstance): Promise<string> {
  const response = await postStepPhoto(
    app,
    await cameraJpeg({ width: 640, height: 480 }),
  );
  if (response.statusCode !== 201) {
    throw new Error(`step photo not stored: ${response.body}`);
  }
  return (response.json() as { photo: { id: string } }).photo.id;
}
