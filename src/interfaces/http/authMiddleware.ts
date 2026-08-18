import type { FastifyReply, FastifyRequest } from 'fastify';
import { InvalidTokenError } from '../../application/auth/errors.js';
import type { TokenService } from '../../application/auth/TokenService.js';
import type { UserRole } from '../../domain/user/User.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: { id: string; role: UserRole };
  }
}

export type AuthMiddleware = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

// Applied as a preHandler hook to every route that needs a logged-in user
// (section: "no permitir GET /documents?ownerId= para acceder libremente").
// Sets request.user from the token instead of trusting anything the client
// claims about who they are.
export function createAuthMiddleware(tokens: TokenService): AuthMiddleware {
  return async (request, _reply) => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new InvalidTokenError();
    }

    const token = header.slice('Bearer '.length);
    const payload = tokens.verify(token); // throws InvalidTokenError itself on failure
    request.user = { id: payload.sub, role: payload.role };
  };
}
