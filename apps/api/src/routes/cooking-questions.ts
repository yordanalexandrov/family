import {
  askCookingQuestionSchema,
  cookingQuestionResponseSchema,
} from '@family/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { actorOf } from '../plugins/acting-user.js';
import { HttpError } from '../plugins/error-handler.js';
import { idParamsSchema } from './params.js';

const NO_SUCH_QUESTION = 'Няма такъв въпрос';

/**
 * „Питай“ in Готвене (`cooking.ask`, GLOSSARY: Въпрос в Готвене): `POST` answers 202 at once (404 for an unknown
 * recipe, 400 for a step it does not have), the client polls `GET /api/recipes/questions/:id` until the status is not
 * `pending`. Both work without an acting user, as on the kiosk; the recipe is never changed.
 */
export const cookingQuestionsRoutes: FastifyPluginAsyncZod = async (app) => {
  const questions = app.cookingQuestions;

  app.post(
    '/api/recipes/:id/questions',
    {
      config: { actingUser: 'optional' },
      schema: {
        params: idParamsSchema,
        body: askCookingQuestionSchema,
        response: { 202: cookingQuestionResponseSchema },
      },
    },
    async (request, reply) => {
      const created = await questions.request(
        { recipeId: request.params.id, asked: request.body },
        actorOf(request)?.id ?? null,
      );
      return reply.code(202).send({ request: created });
    },
  );

  app.get(
    '/api/recipes/questions/:id',
    {
      config: { actingUser: false },
      schema: {
        params: idParamsSchema,
        response: { 200: cookingQuestionResponseSchema },
      },
    },
    async (request) => {
      const found = await questions.get(request.params.id);
      if (!found) {
        throw new HttpError(404, 'not_found', NO_SUCH_QUESTION);
      }
      return { request: found };
    },
  );
};
