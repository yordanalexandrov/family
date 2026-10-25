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
      ...env,
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
    ...env,
    auth: { mode: AUTH_MODE, email: DEV_USER_EMAIL },
  }));

const envSchema = z
  .discriminatedUnion('AUTH_MODE', [cloudflareEnv, devEnv])
  .transform((env) => ({
    ...env,
    /** Google Calendar sync can run: a service account and at least one calendar. */
    calendarConfigured: Boolean(
      env.GOOGLE_SERVICE_ACCOUNT_JSON && env.GOOGLE_CALENDARS,
    ),
    /** Wallet sync can run: a token and the budget to read. */
    budgetConfigured: Boolean(env.WALLET_API_TOKEN && env.WALLET_BUDGET_ID),
  }));

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
