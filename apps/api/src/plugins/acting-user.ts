import type { User } from '@family/shared';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';
import { HttpError } from './error-handler.js';
import { isApiRequest } from './scope.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** The acting user picked on the device (`X-Acting-User`); set on every `/api/*` route that needs one. */
    actor: User;
  }

  interface FastifyContextConfig {
    /** `false`: the route works before a user is picked on the device (e.g. `GET /api/users`). */
    actingUser?: boolean;
  }
}

const userId = z.uuid();

const actingUser: FastifyPluginAsync = async (app) => {
  app.decorateRequest('actor');

  app.addHook('preHandler', async (request) => {
    if (
      request.is404 ||
      !isApiRequest(request) ||
      request.routeOptions.config.actingUser === false
    ) {
      return;
    }

    const header = request.headers['x-acting-user'];
    if (header === undefined || header === '') {
      throw new HttpError(
        400,
        'missing_acting_user',
        'Не е избран потребител на това устройство',
      );
    }

    const actor =
      typeof header === 'string' && userId.safeParse(header).success
        ? await app.users.find(header.toLowerCase())
        : undefined;
    if (!actor) {
      throw new HttpError(400, 'unknown_acting_user', 'Непознат потребител');
    }
    request.actor = actor;
  });
};

export default fp(actingUser, { name: 'acting-user' });
