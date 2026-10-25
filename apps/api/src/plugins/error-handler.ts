import type { ApiErrorCode, ApiErrorResponse } from '@family/shared';
import type { FastifyError, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import {
  ConflictError,
  InvalidReferenceError,
  NotFoundError,
} from '../services/errors.js';

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

    const refusal = serviceRefusal(error);
    if (refusal) {
      return reply.code(refusal.statusCode).send(refusal.body);
    }

    const statusCode = statusOf(error);
    if (statusCode >= 500) {
      // A bug or an outage: always logged in full.
      request.log.error({ err: error }, 'server error');
    }
    return reply.code(statusCode).send(bodyOf(error, statusCode));
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({
      error: 'not_found',
      message: 'Няма такъв адрес',
    } satisfies ApiErrorResponse),
  );
};

/** The status and body of a typed refusal from `services/errors.ts`, or `undefined` for any other error. */
function serviceRefusal(
  error: unknown,
): { statusCode: number; body: ApiErrorResponse } | undefined {
  if (error instanceof NotFoundError) {
    return {
      statusCode: 404,
      body: { error: 'not_found', message: error.message },
    };
  }
  if (error instanceof ConflictError) {
    return {
      statusCode: 409,
      body: { ...error.details, error: 'conflict', message: error.message },
    };
  }
  if (error instanceof InvalidReferenceError) {
    return {
      statusCode: 400,
      body: { error: 'invalid_reference', message: error.message },
    };
  }
  return undefined;
}

/** The error's own status when it is an error status (4xx, 5xx); without one the error is a bug: 500. */
function statusOf(error: FastifyError): number {
  const { statusCode } = error;
  return statusCode !== undefined && statusCode >= 400 && statusCode < 600
    ? statusCode
    : 500;
}

/**
 * The app's HttpError tells the client its own code and message, at any status. Any other error (e.g. Fastify's own
 * FST_ERR_*, not part of the contract) gets the generic code `error` with its message when 4xx, and nothing of
 * itself when 5xx, so internals never leak.
 */
function bodyOf(error: FastifyError, statusCode: number): ApiErrorResponse {
  if (error instanceof HttpError) {
    return { error: error.code, message: error.message };
  }
  if (statusCode < 500) {
    return { error: 'error', message: error.message };
  }
  return { error: 'internal_error', message: 'Вътрешна грешка' };
}

export default fp(errorHandler, { name: 'error-handler' });
