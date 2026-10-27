import {
  IMPORT_PHOTO_MAX_BYTES,
  recipeImportDetailSchema,
  recipeImportParamsSchema,
  recipeImportResponseSchema,
  recipeImportsQuerySchema,
  recipeImportsResponseSchema,
} from '@family/shared';
import multipart from '@fastify/multipart';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { HttpError } from '../plugins/error-handler.js';
import { photoType } from '../services/recipe-photo.js';
import { idParamsSchema } from './params.js';

/** The form field of the photo, as the screen sends it. */
const PHOTO_FIELD = 'photo';

/** A photo import as the multipart form becomes before validation (`readPhoto`); never JSON from the client. */
const photoBodySchema = z.object({
  kind: z.literal('photo'),
  photo: z.object({
    mediaType: z.string(),
    data: z.instanceof(Buffer),
  }),
});

/**
 * Imports of recipes (GLOSSARY: Внасяне на рецепта). A POST answers 202 at once; the client polls `GET …/:id` until the
 * status is not `pending`. Its one suggestion is approved or rejected at `/api/recipe-suggestions/:id/…`.
 *
 * Text and links come as JSON; a photo as `multipart/form-data` with one file in the field `photo` (at most 10 MB after
 * the client has made it smaller, else 413 `photo_too_large`; a JPEG, PNG, WebP or HEIC picture by its bytes, else 415
 * `unsupported_photo`). The photo is read into memory and never written to the database or the disk.
 */
export const recipeImportsRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = app.recipeImports;

  await app.register(multipart, {
    limits: { fileSize: IMPORT_PHOTO_MAX_BYTES, files: 1 },
  });

  app.post(
    '/api/recipe-imports',
    {
      preValidation: async (request) => {
        if (request.isMultipart()) {
          request.body = await readPhoto(request);
        }
      },
      schema: {
        body: z.union([recipeImportParamsSchema, photoBodySchema]),
        response: { 202: recipeImportResponseSchema },
      },
    },
    async (request, reply) => {
      const created = await service.requestImport(
        request.body,
        request.actor.id,
      );
      return reply.code(202).send({ request: created });
    },
  );

  app.get(
    '/api/recipe-imports',
    {
      schema: {
        querystring: recipeImportsQuerySchema,
        response: { 200: recipeImportsResponseSchema },
      },
    },
    async (request) => ({
      requests: await service.listImports(request.query.limit),
    }),
  );

  app.get(
    '/api/recipe-imports/:id',
    {
      schema: {
        params: idParamsSchema,
        response: { 200: recipeImportDetailSchema },
      },
    },
    (request) => service.getImport(request.params.id),
  );
};

/** The one photo of a multipart import, its type read from its bytes. */
async function readPhoto(
  request: FastifyRequest,
): Promise<z.infer<typeof photoBodySchema>> {
  const file = await request.file();
  if (!file || file.fieldname !== PHOTO_FIELD) {
    throw new HttpError(400, 'validation_error', 'Липсва снимка');
  }
  let data: Buffer;
  try {
    data = await file.toBuffer();
  } catch (error) {
    if ((error as { code?: unknown }).code === 'FST_REQ_FILE_TOO_LARGE') {
      throw new HttpError(
        413,
        'photo_too_large',
        'Снимката е над 10 MB. Опитай с по-малка.',
      );
    }
    throw error;
  }
  const mediaType = photoType(data);
  if (!mediaType) {
    throw new HttpError(
      415,
      'unsupported_photo',
      'Това не е снимка (JPEG, PNG, WebP или HEIC).',
    );
  }
  return { kind: 'photo', photo: { mediaType, data } };
}
