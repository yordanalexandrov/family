import { meResponseSchema } from '@family/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

/** Who is using the device: the acting user, and the e-mail that passed Cloudflare Access. */
export const meRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/api/me',
    { schema: { response: { 200: meResponseSchema } } },
    async (request) => ({
      user: request.actor,
      accessEmail: request.user.email,
    }),
  );
};
