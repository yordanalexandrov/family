import { sourcePhotoQuerySchema } from '@family/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { sourcePhotoImage } from '../services/source-photos.js';
import { idParamsSchema } from './params.js';
import { IMMUTABLE } from './photo-form.js';

/**
 * Photos of a recipe source (GLOSSARY: Източник на рецепта, ADR-0016), stored by `POST /api/recipe-imports`. `GET`
 * answers the photo, with `?w=` a thumbnail that wide; it is an `<img>`, which sends no acting user.
 */
export const sourcePhotosRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/api/source-photos/:id',
    {
      config: { actingUser: false },
      schema: { params: idParamsSchema, querystring: sourcePhotoQuerySchema },
    },
    async (request, reply) => {
      const image = await sourcePhotoImage(
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
