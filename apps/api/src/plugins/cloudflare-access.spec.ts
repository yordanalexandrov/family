import { meResponseSchema } from '@family/shared';
import type { FastifyInstance } from 'fastify';
import {
  type CryptoKey,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTPayload,
  SignJWT,
} from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from '../test/app.js';
import { DANI } from '../test/users.js';

const TEAM_DOMAIN = 'https://family-test.cloudflareaccess.com';
const AUD = 'family-test-aud';
const KID = 'access-test-key';
const ALLOWED_EMAIL = 'dani@example.com';

let app: FastifyInstance;
let accessKey: CryptoKey;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  accessKey = privateKey;
  const publicJwk = { ...(await exportJWK(publicKey)), kid: KID, alg: 'RS256' };

  app = buildTestApp({
    auth: {
      mode: 'cloudflare',
      teamDomain: TEAM_DOMAIN,
      audience: AUD,
      allowedEmails: [ALLOWED_EMAIL],
      // Stands in for the team's /cdn-cgi/access/certs.
      jwks: createLocalJWKSet({ keys: [publicJwk] }),
    },
  });
  await app.ready();
});

afterAll(() => app.close());

/** A token shaped like the ones Cloudflare Access issues; `claims` override the defaults. */
function accessToken(
  claims: JWTPayload = {},
  key: CryptoKey = accessKey,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: TEAM_DOMAIN,
    aud: [AUD],
    sub: 'access-user-1',
    email: ALLOWED_EMAIL,
    type: 'app',
    iat: now,
    nbf: now,
    exp: now + 60 * 60,
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .sign(key);
}

function secondsAgo(seconds: number): number {
  return Math.floor(Date.now() / 1000) - seconds;
}

function get(url: string, token?: string) {
  return app.inject({
    method: 'GET',
    url,
    headers: {
      'x-acting-user': DANI.id,
      ...(token === undefined ? {} : { 'cf-access-jwt-assertion': token }),
    },
  });
}

describe('Cloudflare Access (AUTH_MODE=cloudflare)', () => {
  it.each(['/api/me', '/api/users'])(
    'answers 401 missing_access_token on %s without a token',
    async (url) => {
      const response = await get(url);

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: 'missing_access_token' });
    },
  );

  it('GET /api/me returns the e-mail of a valid token as accessEmail', async () => {
    const response = await get('/api/me', await accessToken());

    expect(response.statusCode).toBe(200);
    expect(meResponseSchema.parse(response.json())).toEqual({
      user: DANI,
      accessEmail: ALLOWED_EMAIL,
    });
  });

  it.each([
    [
      'signed by another key',
      async () => accessToken({}, (await generateKeyPair('RS256')).privateKey),
    ],
    [
      'meant for another Access application (aud)',
      () => accessToken({ aud: ['another-app-aud'] }),
    ],
    [
      'issued by another team (iss)',
      () => accessToken({ iss: 'https://another-team.cloudflareaccess.com' }),
    ],
    [
      'that has expired',
      () =>
        accessToken({
          iat: secondsAgo(2 * 60 * 60),
          nbf: secondsAgo(2 * 60 * 60),
          exp: secondsAgo(60 * 60),
        }),
    ],
    ['that is not a JWT', async () => 'not-a-jwt'],
  ])(
    'answers 401 invalid_access_token for a token %s',
    async (_case, token) => {
      const response = await get('/api/me', await token());

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: 'invalid_access_token' });
    },
  );

  it('answers 403 forbidden for a valid token whose e-mail is not in ALLOWED_EMAILS', async () => {
    const response = await get(
      '/api/me',
      await accessToken({ email: 'stranger@example.com' }),
    );

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: 'forbidden' });
  });

  it('answers 403 forbidden for a valid token without an e-mail (e.g. a service token)', async () => {
    const response = await get(
      '/api/me',
      await accessToken({ email: undefined, common_name: 'svc.access' }),
    );

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: 'forbidden' });
  });

  it('matches ALLOWED_EMAILS case-insensitively and reports the e-mail lowercased', async () => {
    const response = await get(
      '/api/me',
      await accessToken({ email: 'Dani@Example.COM' }),
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ accessEmail: 'dani@example.com' });
  });

  it('asks for a token on a percent-encoded /api path too', async () => {
    // The router decodes /%61pi/users to /api/users; the check must not be fooled by the raw URL.
    const response = await get('/%61pi/users');

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: 'missing_access_token' });
  });

  it('lets /healthz through without a token', async () => {
    const response = await get('/healthz');

    expect(response.statusCode).toBe(200);
  });
});
