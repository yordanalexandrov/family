import {
  STEP_PHOTO_MAX_BYTES,
  stepPhotoQuerySchema,
  stepPhotoResponseSchema,
} from '@family/shared';
import multipart from '@fastify/multipart';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { HttpError } from '../plugins/error-handler.js';
import { stepPhotoImage, storeStepPhoto } from '../services/step-photos.js';
import { idParamsSchema } from './params.js';

/** The form field of the photo, as the recipe form sends it. */
const PHOTO_FIELD = 'photo';

/** A photo never changes (another photo is another id), so the browser keeps it for good; only for this person. */
const IMMUTABLE = 'private, max-age=31536000, immutable';

const megabytes = (bytes: number) => Math.round(bytes / (1024 * 1024));

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
  if (!request.isMultipart()) {
    throw new HttpError(400, 'validation_error', 'Липсва снимка');
  }
  try {
    const file = await request.file();
    if (!file || file.fieldname !== PHOTO_FIELD) {
      throw new HttpError(400, 'validation_error', 'Липсва снимка');
    }
    return await file.toBuffer();
  } catch (error) {
    if ((error as { code?: unknown }).code === 'FST_REQ_FILE_TOO_LARGE') {
      throw new HttpError(
        413,
        'photo_too_large',
        `Снимката е над ${megabytes(STEP_PHOTO_MAX_BYTES)} MB. Опитай с по-малка.`,
      );
    }
    throw error;
  }
}
