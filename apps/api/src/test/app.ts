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
  const app = buildApp({
    databaseUrl: TEST_DATABASE_URL,
    auth: DEV_AUTH,
    openclaw: TEST_OPENCLAW,
    ...options,
  });
  openApps.add(app);
  app.addHook('onClose', async () => {
    openApps.delete(app);
  });
  return app;
}

/** The apps of {@link buildTestApp} not closed yet. */
const openApps = new Set<FastifyInstance>();

/**
 * Waits until no app of {@link buildTestApp} has an AI request running in the background. A test that asks for one
 * (202) may end before its run writes; `src/test/setup.ts` awaits this after each test, before the tables are
 * truncated, so the run neither deadlocks with the truncate nor writes into the next test.
 */
export async function settleTestApps(): Promise<void> {
  await Promise.all([...openApps].map((app) => app.aiRunsSettled()));
}
