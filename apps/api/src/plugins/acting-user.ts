import type { User } from '@family/shared';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';
import { HttpError } from './error-handler.js';
import { isApiRequest } from './scope.js';

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * The acting user picked on the device (`X-Acting-User`); set on every `/api/*` route that needs one. A route with
     * `actingUser: 'optional'` may have none: it reads it with {@link actorOf}.
     */
    actor: User;
  }

  interface FastifyContextConfig {
    /**
     * `false`: the route works before a user is picked on the device (e.g. `GET /api/users`). `'optional'`: it works
     * without one too (the kiosk), but a header that is sent is checked and becomes `request.actor` ({@link actorOf}).
     */
    actingUser?: boolean | 'optional';
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
      if (request.routeOptions.config.actingUser === 'optional') {
        return;
      }
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

/** The acting user of a route with `actingUser: 'optional'`; `undefined` when the device has none (the kiosk). */
export function actorOf(request: FastifyRequest): User | undefined {
  // The hook leaves it unset when no header was sent, although `actor` is typed for the routes that require one.
  const actor: User | undefined = request.actor;
  return actor;
}

export default fp(actingUser, { name: 'acting-user' });
