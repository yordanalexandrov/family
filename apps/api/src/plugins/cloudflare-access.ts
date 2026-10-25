import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import {
  createRemoteJWKSet,
  errors,
  type JWTPayload,
  type JWTVerifyGetKey,
  jwtVerify,
} from 'jose';
import type { Config } from '../config.js';
import { HttpError } from './error-handler.js';
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

export type CloudflareAccessOptions =
  /** No token is checked; every request comes from `email`. Local development and tests only. */
  | { mode: 'dev'; email: string }
  | {
      mode: 'cloudflare';
      /** `https://<team>.cloudflareaccess.com`: the token issuer. */
      teamDomain: string;
      /** Application Audience (AUD) tag of the Access application. */
      audience: string;
      /** A second gate behind the Access policy; compared case-insensitively. */
      allowedEmails: string[];
      /**
       * Resolves the token's signing key. Defaults to the team's JWKS at `/cdn-cgi/access/certs`
       * (jose caches it and refetches on an unknown `kid`, which covers key rotation). Tests pass `createLocalJWKSet`.
       */
      jwks?: JWTVerifyGetKey;
    };

/** The plugin options for the configured AUTH_MODE. */
export function accessOptions(config: Config): CloudflareAccessOptions {
  if (config.AUTH_MODE === 'dev') {
    return { mode: 'dev', email: config.DEV_USER_EMAIL };
  }
  return {
    mode: 'cloudflare',
    teamDomain: config.CF_ACCESS_TEAM_DOMAIN,
    audience: config.CF_ACCESS_AUD,
    allowedEmails: config.ALLOWED_EMAILS,
  };
}

const cloudflareAccess: FastifyPluginAsync<CloudflareAccessOptions> = async (
  app,
  options,
) => {
  // Declared up front so every request has the same shape; the hook fills it in.
  app.decorateRequest('user');

  if (options.mode === 'dev') {
    app.log.warn('AUTH_MODE=dev: Cloudflare Access tokens are not verified');
    app.addHook('onRequest', async (request) => {
      if (isApiRequest(request)) {
        request.user = { email: options.email, sub: 'dev' };
      }
    });
    return;
  }

  const jwks =
    options.jwks ??
    createRemoteJWKSet(new URL('/cdn-cgi/access/certs', options.teamDomain));
  const allowedEmails = new Set(
    options.allowedEmails.map((email) => email.toLowerCase()),
  );

  app.addHook('onRequest', async (request) => {
    if (!isApiRequest(request)) {
      return;
    }

    const token = request.headers['cf-access-jwt-assertion'];
    if (typeof token !== 'string' || token === '') {
      throw new HttpError(
        401,
        'missing_access_token',
        'Липсва вход през Cloudflare Access',
      );
    }

    let payload: JWTPayload;
    try {
      // Signature, exp/nbf, issuer and audience; Access signs with RS256 only.
      ({ payload } = await jwtVerify(token, jwks, {
        issuer: options.teamDomain,
        audience: options.audience,
        algorithms: ['RS256'],
      }));
    } catch (error) {
      if (error instanceof errors.JOSEError) {
        request.log.warn({ code: error.code }, 'access token rejected');
        throw new HttpError(
          401,
          'invalid_access_token',
          'Входът през Cloudflare Access е невалиден или изтекъл',
        );
      }
      throw error;
    }

    // Service tokens carry no e-mail; they are not let in either.
    const email =
      typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
    if (!allowedEmails.has(email)) {
      request.log.warn('access e-mail not in ALLOWED_EMAILS');
      throw new HttpError(403, 'forbidden', 'Нямаш достъп до платформата');
    }

    request.user = { email, sub: payload.sub ?? '' };
  });
};

export default fp(cloudflareAccess, { name: 'cloudflare-access' });
