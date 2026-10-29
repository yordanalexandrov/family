import { mealReplaceResponseSchema } from '@family/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { HttpError } from '../plugins/error-handler.js';
import { getLatestReplacement } from '../services/meal-replacements.js';
import { idParamsSchema } from './params.js';

const NO_SUCH_REPLACEMENT = 'Няма такова търсене на друго ястие';

/**
 * „✨ Предложи друго“ (`meal.replace`): `POST` answers 202 at once, the client polls `GET /api/menu/replacements/:id`
 * until the status is not `pending`; `GET /api/menu/meals/:id/replacements` is the meal's latest request, for a sheet
 * opened again. Picking a candidate is `PATCH /api/menu/meals/:id` with its `recipeId` and `why`.
 */
export const mealReplacementsRoutes: FastifyPluginAsyncZod = async (app) => {
  const requests = app.mealReplacements;

  app.post(
    '/api/menu/meals/:id/replacements',
    {
      schema: {
        params: idParamsSchema,
        response: { 202: mealReplaceResponseSchema },
      },
    },
    async (request, reply) => {
      const replacement = await requests.request(
        request.params.id,
        request.actor.id,
      );
      return reply.code(202).send({ replacement });
    },
  );

  app.get(
    '/api/menu/meals/:id/replacements',
    {
      schema: {
        params: idParamsSchema,
        response: { 200: mealReplaceResponseSchema },
      },
    },
    async (request) => ({
      replacement: await getLatestReplacement(app.db, request.params.id),
    }),
  );

  app.get(
    '/api/menu/replacements/:id',
    {
      schema: {
        params: idParamsSchema,
        response: { 200: mealReplaceResponseSchema },
      },
    },
    async (request) => {
      const replacement = await requests.get(request.params.id);
      if (!replacement) {
        throw new HttpError(404, 'not_found', NO_SUCH_REPLACEMENT);
      }
      return { replacement };
    },
  );
};
