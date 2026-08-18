import type { FastifyError, FastifyInstance } from 'fastify';
import { ConcurrencyConflictError, DocumentNotFoundError, ForbiddenError } from '../../application/documents/errors.js';
import { EmailAlreadyRegisteredError, InvalidCredentialsError, InvalidTokenError } from '../../application/auth/errors.js';
import { InvalidDocumentTransitionError } from '../../domain/document/errors.js';

// Single place mapping domain/application errors to HTTP status codes
// (section 15: "taxonomía de errores y HTTP mappings"), instead of each
// route repeating its own try/catch. Routes just let these errors
// propagate.
const ERROR_STATUS_MAP: [new (...args: never[]) => Error, number][] = [
  [DocumentNotFoundError, 404],
  [InvalidDocumentTransitionError, 409],
  [ConcurrencyConflictError, 409],
  [ForbiddenError, 403],
  [EmailAlreadyRegisteredError, 409],
  [InvalidCredentialsError, 401],
  [InvalidTokenError, 401],
];

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    for (const [ErrorClass, status] of ERROR_STATUS_MAP) {
      if (error instanceof ErrorClass) {
        reply.code(status);
        return { error: error.message };
      }
    }

    // Fastify's own schema validation errors already carry a 400 status
    // and a client-safe message; let Fastify's default formatting handle
    // the response body, we just need to make sure we don't mask it below.
    if (error.validation) {
      reply.code(error.statusCode ?? 400);
      return { error: error.message };
    }

    // Unknown error: never leak internals to the client (section 14).
    request.log.error({ err: error }, 'unhandled error');
    reply.code(error.statusCode ?? 500);
    return { error: 'Internal server error' };
  });
}
