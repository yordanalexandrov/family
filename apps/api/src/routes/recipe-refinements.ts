import { recipeRefineResponseSchema } from '@family/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { HttpError } from '../plugins/error-handler.js';
import { idParamsSchema } from './params.js';

const NO_SUCH_REFINEMENT = 'Няма такова подобряване на рецепта';

/**
 * „Подобри рецептата“ (`recipe.refine`): `POST` answers 202 at once (404 for an unknown recipe, 409 while one is
 * pending for it), the client polls `GET /api/recipes/refinements/:id` until the status is not `pending`. The recipe
 * changes only with `PUT /api/recipes/:id` from the form the refinement was put in.
 */
export const recipeRefinementsRoutes: FastifyPluginAsyncZod = async (app) => {
  const requests = app.recipeRefinements;

  app.post(
    '/api/recipes/:id/refinements',
    {
      schema: {
        params: idParamsSchema,
        response: { 202: recipeRefineResponseSchema },
      },
    },
    async (request, reply) => {
      const created = await requests.request(
        request.params.id,
        request.actor.id,
      );
      return reply.code(202).send({ request: created });
    },
  );

  app.get(
    '/api/recipes/refinements/:id',
    {
      schema: {
        params: idParamsSchema,
        response: { 200: recipeRefineResponseSchema },
      },
    },
    async (request) => {
      const found = await requests.get(request.params.id);
      if (!found) {
        throw new HttpError(404, 'not_found', NO_SUCH_REFINEMENT);
      }
      return { request: found };
    },
  );
};
