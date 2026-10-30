import { STEP_PHOTO_MAX_BYTES, stepPhotoResponseSchema } from '@family/shared';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from '../test/app.js';
import { cameraJpeg, HEIC_PHOTO, postStepPhoto } from '../test/photos.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = buildTestApp();
  await app.ready();
});

afterAll(() => app.close());

async function uploaded(bytes: Uint8Array, type?: string): Promise<string> {
  const response = await postStepPhoto(app, bytes, { type });
  expect(response.statusCode).toBe(201);
  return stepPhotoResponseSchema.parse(response.json()).photo.id;
}

/** `GET` as an `<img>` asks for it: no acting user. */
function getPhoto(id: string, query = '') {
  return app.inject({ method: 'GET', url: `/api/step-photos/${id}${query}` });
}

describe('a step photo', () => {
  it('is stored upright, at most 1600 px on the long side and without EXIF', async () => {
    // Stored lying 2400×1200; orientation 6 shows it standing.
    const id = await uploaded(await cameraJpeg({ orientation: 6 }));

    const response = await getPhoto(id);

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/jpeg');
    const stored = await sharp(response.rawPayload).metadata();
    expect(stored).toMatchObject({ format: 'jpeg', width: 800, height: 1600 });
    expect(stored.exif).toBeUndefined();
    expect(stored.orientation).toBeUndefined();
  });

  it('is a smaller picture with ?w=, and both answers are immutable', async () => {
    const id = await uploaded(await cameraJpeg({ width: 1600, height: 1200 }));

    const full = await getPhoto(id);
    const thumbnail = await getPhoto(id, '?w=240');

    expect(thumbnail.statusCode).toBe(200);
    expect(thumbnail.headers['content-type']).toBe('image/jpeg');
    expect(await sharp(thumbnail.rawPayload).metadata()).toMatchObject({
      width: 240,
      height: 180,
    });
    expect(thumbnail.rawPayload.length).toBeLessThan(full.rawPayload.length);
    for (const response of [full, thumbnail]) {
      expect(response.headers['cache-control']).toContain('immutable');
    }
  });

  it('is never made wider than it is', async () => {
    const id = await uploaded(await cameraJpeg({ width: 640, height: 480 }));

    const response = await getPhoto(id, '?w=1200');

    expect(await sharp(response.rawPayload).metadata()).toMatchObject({
      width: 640,
      height: 480,
    });
  });

  it('may be a HEIC from an iPhone, stored as a JPEG', async () => {
    // A gallery may say nothing of the type: it is read from the bytes.
    const id = await uploaded(HEIC_PHOTO, 'application/octet-stream');

    const stored = await sharp((await getPhoto(id)).rawPayload).metadata();

    expect(stored).toMatchObject({ format: 'jpeg', width: 1600, height: 1200 });
  });

  it('may be a PNG or a WebP, stored as a JPEG', async () => {
    const picture = sharp({
      create: { width: 300, height: 200, channels: 4, background: '#0000' },
    });
    for (const bytes of [
      await picture.clone().png().toBuffer(),
      await picture.clone().webp().toBuffer(),
    ]) {
      const id = await uploaded(bytes);

      const stored = await sharp((await getPhoto(id)).rawPayload).metadata();

      expect(stored).toMatchObject({ format: 'jpeg', width: 300, height: 200 });
    }
  });

  it('answers 415 unsupported_photo for a file that is not a photo, whatever it says it is', async () => {
    const response = await postStepPhoto(app, Buffer.from('%PDF-1.7 a recipe'));

    expect(response.statusCode).toBe(415);
    expect(response.json()).toMatchObject({ error: 'unsupported_photo' });
  });

  it('answers 415 unsupported_photo for a photo that does not decode', async () => {
    const start = (await cameraJpeg()).subarray(0, 600);

    const response = await postStepPhoto(app, start);

    expect(response.statusCode).toBe(415);
    expect(response.json()).toMatchObject({ error: 'unsupported_photo' });
  });

  it('answers 413 photo_too_large over 10 MB', async () => {
    const jpeg = await cameraJpeg();
    const large = Buffer.alloc(STEP_PHOTO_MAX_BYTES + 1);
    jpeg.copy(large);

    const response = await postStepPhoto(app, large);

    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({ error: 'photo_too_large' });
  });

  it('answers 400 for a form without the photo', async () => {
    const response = await postStepPhoto(app, await cameraJpeg(), {
      field: 'picture',
    });

    expect(response.statusCode).toBe(400);
  });

  it('answers 404 for an unknown photo and 400 for a width out of range', async () => {
    const id = await uploaded(await cameraJpeg({ width: 640, height: 480 }));

    expect(
      (await getPhoto('99999999-9999-4999-8999-999999999999')).statusCode,
    ).toBe(404);
    expect((await getPhoto(id, '?w=0')).statusCode).toBe(400);
    expect((await getPhoto(id, '?w=5000')).statusCode).toBe(400);
  });
});
