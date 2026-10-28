import { calendarColorTokenSchema } from '@family/shared';
import { z } from 'zod';

/** An optional variable; empty (a blank line in .env) counts as missing. */
function optional<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (value) => (value === '' ? undefined : value),
    schema.optional(),
  );
}

/** One entry of GOOGLE_CALENDARS: a Google calendar to read as a calendar source. */
const calendarSourceEnv = z.object({
  googleCalendarId: z.string().min(1),
  name: z.string().min(1),
  /** The person the calendar belongs to; `null` for the family calendar. */
  ownerUserId: z.uuid().nullable(),
  colorToken: calendarColorTokenSchema,
});

export type CalendarSourceConfig = z.infer<typeof calendarSourceEnv>;

/** GOOGLE_CALENDARS: a JSON array of calendar sources. */
const calendarsJson = z
  .string()
  .transform((value, ctx) => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      ctx.addIssue({ code: 'custom', message: 'must be JSON' });
      return z.NEVER;
    }
  })
  .pipe(z.array(calendarSourceEnv).min(1));
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
    OPENCLAW_MENU_AGENT: z.string().min(1).default('family-menu'),
    OPENCLAW_MEAL_AGENT: z.string().min(1).default('family-meal'),
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
    menuAgent: env.OPENCLAW_MENU_AGENT,
    mealAgent: env.OPENCLAW_MEAL_AGENT,
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

/** A VAPID key as `web-push` prints it: unpadded base64url. */
const base64url = z.string().regex(/^[A-Za-z0-9_-]+$/, 'must be base64url');

/** Who the push services may contact about the sender: `mailto:` or an https url. */
const vapidSubject = z
  .string()
  .regex(/^(mailto:|https:\/\/)\S+$/, 'must start with mailto: or https://');

const VAPID_KEYS = [
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
] as const;

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
  // Google Calendar and Wallet are optional: without them their sync is off and shows as unconfigured.
  GOOGLE_SERVICE_ACCOUNT_JSON: optional(z.string()),
  GOOGLE_CALENDARS: optional(calendarsJson),
  WALLET_API_TOKEN: optional(z.string()),
  WALLET_BUDGET_ID: optional(z.string()),
  // Web Push (ADR-0006): all three or none; without them nothing is sent. `pnpm --filter api vapid-keys` makes a pair.
  VAPID_PUBLIC_KEY: optional(base64url),
  VAPID_PRIVATE_KEY: optional(base64url),
  VAPID_SUBJECT: optional(vapidSubject),
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
  )
  // VAPID_* turn Web Push on together; one or two of them is a mistake, not "off".
  .superRefine((config, ctx) => {
    const given = VAPID_KEYS.filter((key) => config[key] !== undefined);
    if (given.length === 0 || given.length === VAPID_KEYS.length) {
      return;
    }
    for (const key of VAPID_KEYS) {
      if (config[key] === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `is required with ${given.join(', ')}`,
        });
      }
    }
  })
  .transform((env) => ({
    ...env,
    /** Web Push can send: the VAPID key pair and its subject; otherwise `null`. */
    vapid:
      env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT
        ? {
            publicKey: env.VAPID_PUBLIC_KEY,
            privateKey: env.VAPID_PRIVATE_KEY,
            subject: env.VAPID_SUBJECT,
          }
        : null,
    /** Google Calendar sync can run: a service account and at least one calendar; otherwise `null`. */
    googleCalendar:
      env.GOOGLE_SERVICE_ACCOUNT_JSON && env.GOOGLE_CALENDARS
        ? {
            serviceAccountJson: env.GOOGLE_SERVICE_ACCOUNT_JSON,
            calendars: env.GOOGLE_CALENDARS,
          }
        : null,
    /** Wallet sync can run: a token and the budget to read; otherwise `null`. */
    wallet:
      env.WALLET_API_TOKEN && env.WALLET_BUDGET_ID
        ? { apiToken: env.WALLET_API_TOKEN, budgetId: env.WALLET_BUDGET_ID }
        : null,
  }));

export type Config = z.infer<typeof envSchema>;

/** How `/api/*` requests are authenticated; `allowedEmails` are lowercased. */
export type AuthConfig = Config['auth'];

/** The VAPID key pair and subject from VAPID_*, when all three are set. */
export type VapidConfig = NonNullable<Config['vapid']>;

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
