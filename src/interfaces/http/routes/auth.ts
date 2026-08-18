import type { FastifyInstance } from 'fastify';
import type { LoginUserUseCase } from '../../../application/auth/LoginUser.js';
import type { RegisterUserUseCase } from '../../../application/auth/RegisterUser.js';

export interface AuthRoutesDeps {
  registerUser: RegisterUserUseCase;
  loginUser: LoginUserUseCase;
}

const credentialsSchema = {
  type: 'object',
  required: ['email', 'password'],
  properties: {
    email: { type: 'string', format: 'email' },
    password: { type: 'string', minLength: 8 },
  },
} as const;

const errorResponseSchema = { type: 'object', properties: { error: { type: 'string' } } } as const;

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRoutesDeps): void {
  app.post(
    '/auth/register',
    {
      schema: {
        body: credentialsSchema,
        response: {
          201: {
            type: 'object',
            properties: { id: { type: 'string' }, email: { type: 'string' } },
          },
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body as { email: string; password: string };
      const user = await deps.registerUser.execute({ email, password });
      reply.code(201);
      return { id: user.id, email: user.email };
    },
  );

  app.post(
    '/auth/login',
    {
      schema: {
        body: credentialsSchema,
        response: {
          200: {
            type: 'object',
            properties: { accessToken: { type: 'string' }, userId: { type: 'string' } },
          },
          401: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const { email, password } = request.body as { email: string; password: string };
      return deps.loginUser.execute({ email, password });
    },
  );
}
