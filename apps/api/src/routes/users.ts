import { usersResponseSchema } from '@family/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { listUsers } from '../db/repositories/users.js';

/** The people to pick from on the „Кой си?“ screen, ordered by name. */
export const usersRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/api/users',
    {
      // Answers before anyone is picked on the device, so it needs no X-Acting-User.
      config: { actingUser: false },
      schema: { response: { 200: usersResponseSchema } },
    },
    async () => ({ users: await listUsers(app.db) }),
  );
};
