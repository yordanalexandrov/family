import { z } from 'zod';

/** The OpenClaw gateway (`/v1/chat/completions`, ADR-0004); also read on its own by `scripts/suggest-smoke.ts`. */
function openClawFields() {
  return {
    OPENCLAW_URL: z
      .url({ protocol: /^https?$/ })
      .default('http://127.0.0.1:18789')
      .transform((url) => url.replace(/\/+$/, '')),
    // The bearer of `gateway.auth.password`: full operator access, so it is never logged or echoed.
    // Empty = none; without it the OpenClaw client is disabled, which only AUTH_MODE=dev allows.
    OPENCLAW_GATEWAY_PASSWORD: z
      .string()
      .optional()
      .transform((value) => (value ? value : undefined)),
    OPENCLAW_RECIPE_AGENT: z.string().min(1).default('family-recipe'),
    OPENCLAW_TIMEOUT_MS: z.coerce.number().int().positive().default(180_000),
  };
}

type OpenClawEnv = z.infer<z.ZodObject<ReturnType<typeof openClawFields>>>;

/** The OPENCLAW_* variables as the client's settings; a new variable is added here and in `openClawFields`. */
function toOpenClawConfig(env: OpenClawEnv) {
  return {
    url: env.OPENCLAW_URL,
    gatewayPassword: env.OPENCLAW_GATEWAY_PASSWORD,
    recipeAgent: env.OPENCLAW_RECIPE_AGENT,
    timeoutMs: env.OPENCLAW_TIMEOUT_MS,
  };
}

/** Settings of the OpenClaw client (`src/openclaw/client.ts`); no `gatewayPassword` = disabled. */
export type OpenClawConfig = ReturnType<typeof toOpenClawConfig>;

const OPENCLAW_KEYS = Object.keys(openClawFields()) as (keyof OpenClawEnv)[];

const openClawEnv = z.object(openClawFields()).transform(toOpenClawConfig);

/** Splits the OPENCLAW_* variables off an env object into `openclaw`. */
function withOpenClaw<T extends OpenClawEnv>(
  env: T,
): Omit<T, keyof OpenClawEnv> & { openclaw: OpenClawConfig } {
  const rest: Partial<T> = { ...env };
  for (const key of OPENCLAW_KEYS) {
    delete rest[key];
  }
  return {
    ...(rest as Omit<T, keyof OpenClawEnv>),
    openclaw: toOpenClawConfig(env),
  };
}

const baseEnv = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(18091),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  ...openClawFields(),
});

/** Comma-separated e-mail addresses → trimmed, lowercased list with at least one entry. */
const emailList = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0),
  )
  .pipe(z.array(z.email()).min(1));

// Each AUTH_MODE turns its variables into `auth`, the options of the Cloudflare Access plugin.

/** Requests must carry a Cloudflare Access JWT; the only mode allowed in production. */
const cloudflareEnv = baseEnv
  .extend({
    AUTH_MODE: z.literal('cloudflare'),
    // `https://<team>.cloudflareaccess.com`, which is also the `iss` claim of the token — hence no trailing slash.
    CF_ACCESS_TEAM_DOMAIN: z
      .url({ protocol: /^https$/ })
      .transform((url) => url.replace(/\/+$/, '')),
    // Application Audience (AUD) tag of the Access application.
    CF_ACCESS_AUD: z.string().min(1),
    // A second gate behind the Access policy.
    ALLOWED_EMAILS: emailList,
  })
  .transform(
    ({
      AUTH_MODE,
      CF_ACCESS_TEAM_DOMAIN,
      CF_ACCESS_AUD,
      ALLOWED_EMAILS,
      ...env
    }) => ({
      ...withOpenClaw(env),
      auth: {
        mode: AUTH_MODE,
        teamDomain: CF_ACCESS_TEAM_DOMAIN,
        audience: CF_ACCESS_AUD,
        allowedEmails: ALLOWED_EMAILS,
      },
    }),
  );

/** Every request is treated as coming from DEV_USER_EMAIL; for local development only, so refused in production. */
const devEnv = baseEnv
  .extend({
    AUTH_MODE: z.literal('dev'),
    DEV_USER_EMAIL: z.email(),
  })
  .refine((env) => env.NODE_ENV !== 'production', {
    path: ['AUTH_MODE'],
    message: 'must be "cloudflare" when NODE_ENV is production',
  })
  .transform(({ AUTH_MODE, DEV_USER_EMAIL, ...env }) => ({
    ...withOpenClaw(env),
    auth: { mode: AUTH_MODE, email: DEV_USER_EMAIL },
  }));

const envSchema = z
  .discriminatedUnion('AUTH_MODE', [cloudflareEnv, devEnv])
  // Only dev mode may run with OpenClaw disabled; production is always cloudflare mode, so it is covered too.
  .refine(
    (config) =>
      config.auth.mode === 'dev' ||
      config.openclaw.gatewayPassword !== undefined,
    {
      path: ['OPENCLAW_GATEWAY_PASSWORD'],
      message: 'is required unless AUTH_MODE is dev',
    },
  );

export type Config = z.infer<typeof envSchema>;

/** How `/api/*` requests are authenticated; `allowedEmails` are lowercased. */
export type AuthConfig = Config['auth'];

/** Parses the process environment; throws a readable error naming every invalid variable. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }

  return result.data;
}

/** Only the OPENCLAW_* variables, for scripts that talk to the gateway without the rest of the api. */
export function loadOpenClawConfig(
  env: NodeJS.ProcessEnv = process.env,
): OpenClawConfig {
  const result = openClawEnv.safeParse(env);

  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }

  return result.data;
}
