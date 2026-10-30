import {
  STEP_PHOTO_MAX_BYTES,
  stepPhotoQuerySchema,
  stepPhotoResponseSchema,
} from '@family/shared';
import multipart from '@fastify/multipart';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { stepPhotoImage, storeStepPhoto } from '../services/step-photos.js';
import { idParamsSchema } from './params.js';
import { missingPhoto, PHOTO_FIELD, photoTooLarge } from './photo-form.js';

/** A photo never changes (another photo is another id), so the browser keeps it for good; only for this person. */
const IMMUTABLE = 'private, max-age=31536000, immutable';

/**
 * Step photos (GLOSSARY: Снимка на стъпка, ADR-0008). `POST` takes one photo as `multipart/form-data` in the field
 * `photo` the moment it is chosen and answers its id; the step points at it from „Запази“ on. `GET` answers the photo,
 * with `?w=` a thumbnail that wide; it is an `<img>`, which sends no acting user.
 */
export const stepPhotosRoutes: FastifyPluginAsyncZod = async (app) => {
  await app.register(multipart, {
    limits: { fileSize: STEP_PHOTO_MAX_BYTES, files: 1 },
  });

  app.post(
    '/api/step-photos',
    { schema: { response: { 201: stepPhotoResponseSchema } } },
    async (request, reply) => {
      const id = await storeStepPhoto(app.db, await readPhoto(request));
      return reply.code(201).send({ photo: { id } });
    },
  );

  app.get(
    '/api/step-photos/:id',
    {
      config: { actingUser: false },
      schema: { params: idParamsSchema, querystring: stepPhotoQuerySchema },
    },
    async (request, reply) => {
      const image = await stepPhotoImage(
        app.db,
        request.params.id,
        request.query.w,
      );
      return reply
        .header('content-type', 'image/jpeg')
        .header('cache-control', IMMUTABLE)
        .send(image);
    },
  );
};

/** The one photo of the form, as it came. */
async function readPhoto(request: FastifyRequest): Promise<Buffer> {
  const file = request.isMultipart() ? await request.file() : undefined;
  if (file?.fieldname !== PHOTO_FIELD) {
    throw missingPhoto();
  }
  try {
    return await file.toBuffer();
  } catch (error) {
    throw photoTooLarge(error, STEP_PHOTO_MAX_BYTES) ?? error;
  }
}
