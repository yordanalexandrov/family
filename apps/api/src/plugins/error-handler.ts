import type { FastifyError, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

/** Body of every error response: an English code for the client, a Bulgarian message for the screen. */
interface ErrorResponse {
  error: string;
  message: string;
  issues?: ValidationIssue[];
}

interface ValidationIssue {
  /** Dotted path inside the validated part (query, body, params), e.g. `items.0.qty`. */
  path: string;
  message: string;
}

/**
 * A refusal the client can act on. The error handler answers it with `statusCode` and
 * `{ error: code, message }`; `message` reaches the screen, so it is written in Bulgarian.
 */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
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
      } satisfies ErrorResponse);
    }

    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send({
        error: typeof error.code === 'string' ? error.code : 'error',
        message: error.message,
      } satisfies ErrorResponse);
    }

    // Anything else is a bug or an outage: log it in full, tell the client nothing about it.
    request.log.error({ err: error }, 'unhandled error');
    return reply.code(500).send({
      error: 'internal_error',
      message: 'Вътрешна грешка',
    } satisfies ErrorResponse);
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({
      error: 'not_found',
      message: 'Няма такъв адрес',
    } satisfies ErrorResponse),
  );
};

export default fp(errorHandler, { name: 'error-handler' });
