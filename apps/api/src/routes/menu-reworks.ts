import {
  createMenuReworkSchema,
  menuReworkResponseSchema,
  menuReworksQuerySchema,
} from '@family/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { HttpError } from '../plugins/error-handler.js';
import { getLatestRework } from '../services/menu-reworks.js';
import { idParamsSchema } from './params.js';

const NO_SUCH_REWORK = 'Няма такава преработка на менюто';

/**
 * „✨ Преработи менюто“ (`menu.rework`, GLOSSARY: Преработка на менюто): `POST` answers 202 at once, the client polls
 * `GET /api/menu/reworks/:id` until the status is not `pending`, then reads the plan. `GET /api/menu/reworks?weekStart=`
 * is the week's newest rework, for „AI преработва менюто…“ on every device; the two reads need no acting user, as the
 * reads of a proposal.
 */
export const menuReworksRoutes: FastifyPluginAsyncZod = async (app) => {
  const requests = app.menuReworks;

  app.post(
    '/api/menu/reworks',
    {
      schema: {
        body: createMenuReworkSchema,
        response: { 202: menuReworkResponseSchema },
      },
    },
    async (request, reply) => {
      const rework = await requests.request(request.body, request.actor.id);
      return reply.code(202).send({ rework });
    },
  );

  app.get(
    '/api/menu/reworks',
    {
      config: { actingUser: false },
      schema: {
        querystring: menuReworksQuerySchema,
        response: { 200: menuReworkResponseSchema },
      },
    },
    async (request) => ({
      rework: await getLatestRework(app.db, request.query.weekStart),
    }),
  );

  app.get(
    '/api/menu/reworks/:id',
    {
      config: { actingUser: false },
      schema: {
        params: idParamsSchema,
        response: { 200: menuReworkResponseSchema },
      },
    },
    async (request) => {
      const rework = await requests.get(request.params.id);
      if (!rework) {
        throw new HttpError(404, 'not_found', NO_SUCH_REWORK);
      }
      return { rework };
    },
  );
};
