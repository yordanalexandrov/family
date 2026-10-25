import type { FastifyInstance } from 'fastify';
import { type BuildAppOptions, buildApp } from '../app.js';
import type { CloudflareAccessOptions } from '../plugins/cloudflare-access.js';
import { TEST_DATABASE_URL } from './db.js';
import { TEST_OPENCLAW } from './openclaw.js';

/** AUTH_MODE=dev in specs: no Access token needed, every `/api/*` request passed Access as this e-mail. */
export const DEV_AUTH = {
  mode: 'dev',
  email: 'dev@example.com',
} as const satisfies CloudflareAccessOptions;

/**
 * The app as specs drive it with `app.inject()`: the test database and dev auth, passed explicitly because
 * `buildApp()` has no auth default. A spec overrides `databaseUrl` (e.g. an unreachable database), `auth` or
 * `openclaw` (msw in `src/test/openclaw.ts` answers for `TEST_OPENCLAW`; `openclaw: undefined` disables it).
 */
export function buildTestApp(
  options: Partial<BuildAppOptions> = {},
): FastifyInstance {
  return buildApp({
    databaseUrl: TEST_DATABASE_URL,
    auth: DEV_AUTH,
    openclaw: TEST_OPENCLAW,
    ...options,
  });
}
