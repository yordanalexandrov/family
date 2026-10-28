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
  // 404: no such route, or no such record (e.g. a recipe id).
  'not_found',
  // 409: the record clashes with an existing one (e.g. an ingredient name); the body names the existing one.
  'conflict',
  // 409: the link of an import by link is already a recipe's source or a proposed suggestion's; the body names it.
  'already_imported',
  // 413: the photo of an import is over IMPORT_PHOTO_MAX_BYTES.
  'photo_too_large',
  // 415: the photo of an import is not a JPEG, PNG, WebP or HEIC picture.
  'unsupported_photo',
  // 400: the body points at a record that does not exist (e.g. an unknown ingredientId in a recipe).
  'invalid_reference',
  // 503: the OpenClaw client is disabled (no gateway password, local dev), so no suggestions can be asked for.
  'openclaw_unavailable',
  // 400: the action does not apply to this kind of record (e.g. hiding or deleting the wrong kind of shopping item).
  'invalid_action',
  // 5xx: a bug or an outage; the client is told nothing more.
  'internal_error',
  // Anything else without a code of its own; its message is for the screen (e.g. Fastify's 415 for an unsupported content type).
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

/**
 * The body of a refusal with a sub-code (`refusalSchemas` in `refusal.ts`): `error`, `code`, `message` and, when the
 * code carries any, its details.
 */
export function refusalBody<
  E extends ApiErrorCode,
  C extends string,
  D extends z.ZodRawShape = Record<never, never>,
>(error: E, code: C, details?: D) {
  return z.object({
    error: z.literal(error),
    code: z.literal(code),
    message: z.string(),
    ...(details ?? ({} as D)),
  });
}
