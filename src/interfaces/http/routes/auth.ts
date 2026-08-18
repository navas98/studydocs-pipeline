import type { FastifyInstance } from 'fastify';
import type { LoginUserUseCase } from '../../../application/auth/LoginUser.js';
import type { LoginWithGoogleUseCase } from '../../../application/auth/LoginWithGoogle.js';
import type { RegisterUserUseCase } from '../../../application/auth/RegisterUser.js';

export interface AuthRoutesDeps {
  registerUser: RegisterUserUseCase;
  loginUser: LoginUserUseCase;
  // Only set once GOOGLE_CLIENT_ID is configured — POST /auth/google isn't
  // registered at all otherwise, rather than existing and always failing.
  loginWithGoogle?: LoginWithGoogleUseCase;
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

  if (deps.loginWithGoogle) {
    const loginWithGoogle = deps.loginWithGoogle;
    app.post(
      '/auth/google',
      {
        schema: {
          body: {
            type: 'object',
            required: ['idToken'],
            properties: { idToken: { type: 'string', minLength: 1 } },
          },
          response: {
            200: {
              type: 'object',
              properties: { accessToken: { type: 'string' }, userId: { type: 'string' } },
            },
            401: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const { idToken } = request.body as { idToken: string };
        return loginWithGoogle.execute(idToken);
      },
    );
  }
}
