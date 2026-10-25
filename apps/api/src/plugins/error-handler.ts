import type { ApiErrorCode, ApiErrorResponse } from '@family/shared';
import type { FastifyError, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

/**
 * A refusal the client can act on. The error handler answers it with `statusCode` and
 * `{ error: code, message }` (`apiErrorSchema` in shared); `message` reaches the screen, so it is written in Bulgarian.
 */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;

  constructor(statusCode: number, code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const errorHandler: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.validation) {
      return reply.code(400).send({
        error: 'validation_error',
        message: 'Невалидни данни в заявката',
        issues: error.validation.map((issue) => ({
          path: issue.instancePath.replace(/^\//, '').replaceAll('/', '.'),
          message: issue.message ?? 'Невалидна стойност',
        })),
      } satisfies ApiErrorResponse);
    }

    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send({
        // Only the app's own refusals have a code of the contract; Fastify's FST_ERR_* are not part of it.
        error: error instanceof HttpError ? error.code : 'error',
        message: error.message,
      } satisfies ApiErrorResponse);
    }

    // Anything else is a bug or an outage: log it in full, tell the client nothing about it.
    request.log.error({ err: error }, 'unhandled error');
    return reply.code(500).send({
      error: 'internal_error',
      message: 'Вътрешна грешка',
    } satisfies ApiErrorResponse);
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({
      error: 'not_found',
      message: 'Няма такъв адрес',
    } satisfies ApiErrorResponse),
  );
};

export default fp(errorHandler, { name: 'error-handler' });
