import { z } from 'zod';

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

/** Requests must carry a Cloudflare Access JWT; the only mode allowed in production. */
const cloudflareEnv = baseEnv.extend({
  AUTH_MODE: z.literal('cloudflare'),
  // `https://<team>.cloudflareaccess.com`, which is also the `iss` claim of the token — hence no trailing slash.
  CF_ACCESS_TEAM_DOMAIN: z
    .url({ protocol: /^https$/ })
    .transform((url) => url.replace(/\/+$/, '')),
  CF_ACCESS_AUD: z.string().min(1),
  ALLOWED_EMAILS: emailList,
});

/** Every request is treated as coming from DEV_USER_EMAIL; for local development only. */
const devEnv = baseEnv.extend({
  AUTH_MODE: z.literal('dev'),
  DEV_USER_EMAIL: z.email(),
});

const envSchema = z
  .discriminatedUnion('AUTH_MODE', [cloudflareEnv, devEnv])
  .refine(
    (env) => env.NODE_ENV !== 'production' || env.AUTH_MODE === 'cloudflare',
    {
      path: ['AUTH_MODE'],
      message: 'must be "cloudflare" when NODE_ENV is production',
    },
  );

export type Config = z.infer<typeof envSchema>;

/** Parses the process environment; throws a readable error naming every invalid variable. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }

  return result.data;
}
