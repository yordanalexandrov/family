import {
  recipeRevisionResponseSchema,
  requestRevisionSchema,
  requestSuggestionRevisionSchema,
} from '@family/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { actorOf } from '../plugins/acting-user.js';
import { HttpError } from '../plugins/error-handler.js';
import { rejectRevision } from '../services/recipe-revisions.js';
import { idParamsSchema } from './params.js';

const NO_SUCH_REVISION = 'Няма такава поправка на рецепта';

/**
 * „✏️ Поправи с AI“ (`recipe.revise`, GLOSSARY: Поправка на рецепта): `POST` answers 202 at once (404 for an unknown
 * recipe or suggestion, 409 `revision_open` with the id of the open revision while there is one), the client polls
 * `GET /api/recipes/revisions/:id` until the status is not `pending`; `stale` there says the recipe was saved since. „Отхвърли“ is
 * `POST …/reject`; „Приеми“ writes nothing: the recipe changes with `PUT /api/recipes/:id` and `revisionId`, which
 * marks the revision `accepted`. All three work without an acting user, as on the kiosk. A suggestion is revised from
 * its review form's recipe (409 when it is decided or has an open revision) and approved with `revisionId`.
 */
export const recipeRevisionsRoutes: FastifyPluginAsyncZod = async (app) => {
  const revisions = app.recipeRevisions;

  app.post(
    '/api/recipes/:id/revisions',
    {
      config: { actingUser: 'optional' },
      schema: {
        params: idParamsSchema,
        body: requestRevisionSchema,
        response: { 202: recipeRevisionResponseSchema },
      },
    },
    async (request, reply) => {
      const created = await revisions.request(
        { recipeId: request.params.id, ...request.body },
        actorOf(request)?.id ?? null,
      );
      return reply.code(202).send({ request: created });
    },
  );

  app.post(
    '/api/recipe-suggestions/:id/revisions',
    {
      config: { actingUser: 'optional' },
      schema: {
        params: idParamsSchema,
        body: requestSuggestionRevisionSchema,
        response: { 202: recipeRevisionResponseSchema },
      },
    },
    async (request, reply) => {
      const created = await revisions.request(
        { suggestionId: request.params.id, ...request.body },
        actorOf(request)?.id ?? null,
      );
      return reply.code(202).send({ request: created });
    },
  );

  app.get(
    '/api/recipes/revisions/:id',
    {
      config: { actingUser: false },
      schema: {
        params: idParamsSchema,
        response: { 200: recipeRevisionResponseSchema },
      },
    },
    async (request) => {
      const found = await revisions.get(request.params.id);
      if (!found) {
        throw new HttpError(404, 'not_found', NO_SUCH_REVISION);
      }
      return { request: found };
    },
  );

  app.post(
    '/api/recipes/revisions/:id/reject',
    {
      config: { actingUser: 'optional' },
      schema: {
        params: idParamsSchema,
        response: { 200: recipeRevisionResponseSchema },
      },
    },
    async (request) => ({
      request: await rejectRevision(
        app.db,
        request.params.id,
        actorOf(request)?.id ?? null,
      ),
    }),
  );
};
