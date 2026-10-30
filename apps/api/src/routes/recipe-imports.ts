import {
  IMPORT_PHOTO_MAX_BYTES,
  IMPORT_PHOTO_MAX_PARTS,
  IMPORT_PHOTOS_MAX_BYTES,
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
import {
  megabytes,
  missingPhoto,
  PHOTO_FIELD,
  photoTooLarge,
} from './photo-form.js';

const photoSchema = z.object({
  mediaType: z.string(),
  data: z.instanceof(Buffer),
});

/** A photo import as the multipart form becomes before validation (`readPhotos`); never JSON from the client. */
const photoBodySchema = z.object({
  kind: z.literal('photo'),
  photos: z.array(photoSchema).min(1).max(IMPORT_PHOTO_MAX_PARTS),
});

/**
 * Imports of recipes (GLOSSARY: Внасяне на рецепта). A POST answers 202 at once; the client polls `GET …/:id` until the
 * status is not `pending`. Its one suggestion is approved or rejected at `/api/recipe-suggestions/:id/…`.
 *
 * Text and links come as JSON; a photo as `multipart/form-data` with 1–8 files in the field `photo`: one photo, or the
 * parts of a long screenshot top to bottom. Each at most 10 MB and all at most 20 MB after the client has made them
 * smaller (else 413 `photo_too_large`), each a JPEG, PNG, WebP or HEIC picture by its bytes (else 415
 * `unsupported_photo`). The photos are read into memory and never written to the database or the disk.
 */
export const recipeImportsRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = app.recipeImports;

  await app.register(multipart, {
    limits: { fileSize: IMPORT_PHOTO_MAX_BYTES, files: IMPORT_PHOTO_MAX_PARTS },
  });

  app.post(
    '/api/recipe-imports',
    {
      preValidation: async (request) => {
        if (request.isMultipart()) {
          request.body = await readPhotos(request);
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

/** The photos of a multipart import, in their order, each one's type read from its bytes. */
async function readPhotos(
  request: FastifyRequest,
): Promise<z.infer<typeof photoBodySchema>> {
  const photos: z.infer<typeof photoSchema>[] = [];
  let total = 0;
  try {
    for await (const file of request.files()) {
      if (file.fieldname !== PHOTO_FIELD) {
        throw missingPhoto();
      }
      const data = await file.toBuffer();
      total += data.length;
      if (total > IMPORT_PHOTOS_MAX_BYTES) {
        throw new HttpError(
          413,
          'photo_too_large',
          `Снимките са над ${megabytes(IMPORT_PHOTOS_MAX_BYTES)} MB общо. Опитай с по-малка.`,
        );
      }
      const mediaType = photoType(data);
      if (!mediaType) {
        throw new HttpError(
          415,
          'unsupported_photo',
          'Това не е снимка (JPEG, PNG, WebP или HEIC).',
        );
      }
      photos.push({ mediaType, data });
    }
  } catch (error) {
    const tooLarge = photoTooLarge(error, IMPORT_PHOTO_MAX_BYTES);
    if (tooLarge) {
      throw tooLarge;
    }
    if ((error as { code?: unknown }).code === 'FST_FILES_LIMIT') {
      throw new HttpError(
        400,
        'validation_error',
        `Най-много ${IMPORT_PHOTO_MAX_PARTS} снимки наведнъж.`,
      );
    }
    throw error;
  }
  if (photos.length === 0) {
    throw missingPhoto();
  }
  return { kind: 'photo', photos };
}
