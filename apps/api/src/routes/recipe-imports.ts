import {
  recipeImportDetailSchema,
  recipeImportParamsSchema,
  recipeImportResponseSchema,
  recipeImportsQuerySchema,
  recipeImportsResponseSchema,
} from '@family/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { idParamsSchema } from './params.js';

/**
 * Imports of recipes (GLOSSARY: Внасяне на рецепта). A POST answers 202 at once; the client polls `GET …/:id` until the
 * status is not `pending`. Its one suggestion is approved or rejected at `/api/recipe-suggestions/:id/…`.
 */
export const recipeImportsRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = app.recipeImports;

  app.post(
    '/api/recipe-imports',
    {
      schema: {
        body: recipeImportParamsSchema,
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
