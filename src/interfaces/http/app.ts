import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import staticPlugin from '@fastify/static';
import swagger from '@fastify/swagger';
import type { LoginUserUseCase } from '../../application/auth/LoginUser.js';
import type { LoginWithGoogleUseCase } from '../../application/auth/LoginWithGoogle.js';
import type { RegisterUserUseCase } from '../../application/auth/RegisterUser.js';
import type { CompleteUploadUseCase } from '../../application/documents/CompleteUpload.js';
import type { CreateDocumentUseCase } from '../../application/documents/CreateDocument.js';
import type { DeleteDocumentUseCase } from '../../application/documents/DeleteDocument.js';
import type { DownloadDocumentFileUseCase } from '../../application/documents/DownloadDocumentFile.js';
import type { GetDocumentUseCase } from '../../application/documents/GetDocument.js';
import type { ListDocumentsUseCase } from '../../application/documents/ListDocuments.js';
import type { RetryDocumentUseCase } from '../../application/documents/RetryDocument.js';
import type { SearchDocumentsUseCase } from '../../application/documents/SearchDocuments.js';
import type { UpdateDocumentMetadataUseCase } from '../../application/documents/UpdateDocumentMetadata.js';
import type { AuthMiddleware } from './authMiddleware.js';
import { registerErrorHandler } from './errorHandler.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerDocumentRoutes } from './routes/documents.js';
import { registerSearchRoutes } from './routes/search.js';

export type HealthStatus = 'ok' | 'error';

// Real readiness (section 9/15), not a hardcoded { status: "ok" }: pings
// the stateful dependencies the API actually needs to function.
export type CheckHealth = () => Promise<Record<string, HealthStatus>>;

export interface AppDeps {
  createDocument: CreateDocumentUseCase;
  getDocument: GetDocumentUseCase;
  listDocuments: ListDocumentsUseCase;
  completeUpload: CompleteUploadUseCase;
  searchDocuments: SearchDocumentsUseCase;
  updateDocumentMetadata: UpdateDocumentMetadataUseCase;
  retryDocument: RetryDocumentUseCase;
  downloadDocumentFile: DownloadDocumentFileUseCase;
  deleteDocument: DeleteDocumentUseCase;
  checkHealth: CheckHealth;
  registerUser: RegisterUserUseCase;
  loginUser: LoginUserUseCase;
  loginWithGoogle?: LoginWithGoogleUseCase;
  authMiddleware: AuthMiddleware;
}

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB, per section 14 (max size restriction)
const FRONTEND_DIST_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../frontend/dist');

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: true,
    // Trust a caller-supplied correlation id (section 15) so it can be
    // traced through the API, SQS and worker logs as one thread; generate
    // one otherwise. Echoed back via the x-correlation-id response header.
    genReqId: (request) => {
      const provided = request.headers['x-correlation-id'];
      return typeof provided === 'string' && provided.length > 0 ? provided : randomUUID();
    },
  });

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-correlation-id', request.id);
  });

  registerErrorHandler(app);

  await app.register(swagger, {
    openapi: {
      info: { title: 'StudyDocs Pipeline API', version: '0.1.0' },
    },
  });

  await app.register(multipart, {
    limits: { fileSize: MAX_UPLOAD_BYTES },
  });

  // Global: false — only routes that opt in via `config.rateLimit` (the
  // /auth/* endpoints, to slow down credential-stuffing/brute force) are
  // throttled; everything else is unaffected.
  await app.register(rateLimit, { global: false });

  // Demo frontend (section 18, Day 5) — React SPA built by Vite, served
  // straight from the API so the whole demo runs with one process and no
  // separate frontend server/CORS setup in production.
  await app.register(staticPlugin, { root: FRONTEND_DIST_DIR });

  app.get('/openapi.json', async () => app.swagger());
  app.get('/health', async (_request, reply) => {
    const checks = await deps.checkHealth();
    const healthy = Object.values(checks).every((status) => status === 'ok');
    reply.code(healthy ? 200 : 503);
    return { status: healthy ? 'ok' : 'error', checks };
  });

  registerAuthRoutes(app, deps);

  // Everything under this plugin requires a valid Bearer token — the
  // preHandler hook is scoped to this encapsulation context, so /auth/*,
  // /health and the static frontend stay public.
  await app.register(async (protectedRoutes) => {
    protectedRoutes.addHook('preHandler', deps.authMiddleware);
    registerDocumentRoutes(protectedRoutes, deps);
    registerSearchRoutes(protectedRoutes, deps);
  });

  // React Router uses client-side routing (/demo, /decisions have no
  // matching file on disk), so any unmatched GET falls back to the SPA
  // shell and lets the browser router take over.
  app.setNotFoundHandler((request, reply) => {
    if (request.method !== 'GET') {
      reply.code(404);
      return { error: 'Not found' };
    }
    return reply.sendFile('index.html');
  });

  return app;
}
