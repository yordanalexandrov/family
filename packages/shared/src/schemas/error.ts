import { z } from 'zod';

/** Every `error` code the api answers with. English identifiers for code; the `message` next to them is Bulgarian. */
export const apiErrorCodeSchema = z.enum([
  // 400: query, body or params do not match the route's schema; `issues` says where.
  'validation_error',
  // 401: no Cloudflare Access token on an /api request.
  'missing_access_token',
  // 401: the Access token is invalid or expired.
  'invalid_access_token',
  // 403: the Access e-mail is not let in.
  'forbidden',
  // 400: no X-Acting-User header.
  'missing_acting_user',
  // 400: X-Acting-User names no user (e.g. the user was removed).
  'unknown_acting_user',
  // 404: no such route.
  'not_found',
  // 5xx: a bug or an outage; the client is told nothing more.
  'internal_error',
  // Any other refusal without a code of its own, e.g. Fastify's 415 for an unsupported content type.
  'error',
]);

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

/** Body of every error response of the api. */
export const apiErrorSchema = z.object({
  error: apiErrorCodeSchema,
  message: z.string(),
  /** Only with `validation_error`. */
  issues: z
    .array(
      z.object({
        /** Dotted path inside the validated part (query, body, params), e.g. `items.0.qty`. */
        path: z.string(),
        message: z.string(),
      }),
    )
    .optional(),
});

export type ApiErrorResponse = z.infer<typeof apiErrorSchema>;
