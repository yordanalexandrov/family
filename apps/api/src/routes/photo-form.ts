import { HttpError } from '../plugins/error-handler.js';

/** The form field of a photo, as the recipe form and the import screen send it. */
export const PHOTO_FIELD = 'photo';

/** A photo form without its photo, or with a file in another field: 400 `validation_error`. */
export function missingPhoto(): HttpError {
  return new HttpError(400, 'validation_error', 'Липсва снимка');
}

/** `bytes` in whole megabytes, as a refusal names a limit. */
export function megabytes(bytes: number): number {
  return Math.round(bytes / (1024 * 1024));
}

/**
 * The refusal of a file over the multipart limit (`FST_REQ_FILE_TOO_LARGE` of `@fastify/multipart`): 413
 * `photo_too_large`, naming the limit `maxBytes`; `undefined` for any other error.
 */
export function photoTooLarge(
  error: unknown,
  maxBytes: number,
): HttpError | undefined {
  if ((error as { code?: unknown }).code !== 'FST_REQ_FILE_TOO_LARGE') {
    return undefined;
  }
  return new HttpError(
    413,
    'photo_too_large',
    `Снимката е над ${megabytes(maxBytes)} MB. Опитай с по-малка.`,
  );
}
