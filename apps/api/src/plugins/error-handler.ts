import type { FastifyError, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';

/** Every error response: an English code for the client, a Bulgarian message for the screen. */
export interface ApiError {
  error: string;
  message: string;
  issues?: ValidationIssue[];
}

export interface ValidationIssue {
  /** Dotted path inside the body/query/params, e.g. `items.0.qty`. */
  path: string;
  message: string;
}

const errorHandler: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      const issues: ValidationIssue[] = error.validation.map((issue) => ({
        path: issue.instancePath.replace(/^\//, '').replaceAll('/', '.'),
        message: issue.message ?? 'Невалидна стойност',
      }));
      return reply.code(400).send({
        error: 'validation_error',
        message: 'Невалидни данни в заявката',
        issues,
      } satisfies ApiError);
    }

    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send({
        error: typeof error.code === 'string' ? error.code : 'error',
        message: error.message,
      } satisfies ApiError);
    }

    // Anything else is a bug or an outage: log it in full, tell the client nothing about it.
    request.log.error({ err: error }, 'unhandled error');
    return reply.code(500).send({
      error: 'internal_error',
      message: 'Вътрешна грешка',
    } satisfies ApiError);
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({
      error: 'not_found',
      message: 'Няма такъв адрес',
    } satisfies ApiError),
  );
};

export default fp(errorHandler, { name: 'error-handler' });
