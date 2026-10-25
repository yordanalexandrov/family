import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { isApiRequest } from './scope.js';

/** Who passed Cloudflare Access: the verified e-mail and Access's stable user id. Not the acting user. */
export interface AccessUser {
  email: string;
  sub: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Set on every `/api/*` request that passed Access. */
    user: AccessUser;
  }
}

/** `dev`: no token is checked, every request comes from `email`. */
export type CloudflareAccessOptions = { mode: 'dev'; email: string };

const cloudflareAccess: FastifyPluginAsync<CloudflareAccessOptions> = async (
  app,
  options,
) => {
  // Declared up front so every request has the same shape; the hook fills it in.
  app.decorateRequest('user');

  app.log.warn('AUTH_MODE=dev: Cloudflare Access tokens are not verified');
  app.addHook('onRequest', async (request) => {
    if (isApiRequest(request)) {
      request.user = { email: options.email, sub: 'dev' };
    }
  });
};

export default fp(cloudflareAccess, { name: 'cloudflare-access' });
