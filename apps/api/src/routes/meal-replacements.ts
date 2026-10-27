import { mealReplaceResponseSchema } from '@family/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { idParamsSchema } from './params.js';

/**
 * „✨ Предложи друго“ (`meal.replace`): `POST` answers 202 at once, the client polls `GET /api/menu/replacements/:id`
 * until the status is not `pending`. Picking a candidate is `PATCH /api/menu/meals/:id` with its `recipeId` and `why`.
 */
export const mealReplacementsRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = app.mealReplacements;

  app.post(
    '/api/menu/meals/:id/replacements',
    {
      schema: {
        params: idParamsSchema,
        response: { 202: mealReplaceResponseSchema },
      },
    },
    async (request, reply) => {
      const replacement = await service.request(
        request.params.id,
        request.actor.id,
      );
      return reply.code(202).send({ replacement });
    },
  );

  app.get(
    '/api/menu/replacements/:id',
    {
      schema: {
        params: idParamsSchema,
        response: { 200: mealReplaceResponseSchema },
      },
    },
    async (request) => ({
      replacement: await service.get(request.params.id),
    }),
  );
};
