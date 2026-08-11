import pino from 'pino';

// Structured JSON logging (section 15). Shared between the worker (which
// has no Fastify request logger of its own) and any application-layer
// code that needs to log outside the HTTP request/response cycle.
export const logger = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });
