import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import type { CompleteUploadUseCase } from '../../application/documents/CompleteUpload.js';
import type { CreateDocumentUseCase } from '../../application/documents/CreateDocument.js';
import type { GetDocumentUseCase } from '../../application/documents/GetDocument.js';
import type { ListDocumentsUseCase } from '../../application/documents/ListDocuments.js';
import type { RetryDocumentUseCase } from '../../application/documents/RetryDocument.js';
import type { SearchDocumentsUseCase } from '../../application/documents/SearchDocuments.js';
import type { UpdateDocumentMetadataUseCase } from '../../application/documents/UpdateDocumentMetadata.js';
import { registerDocumentRoutes } from './routes/documents.js';
import { registerSearchRoutes } from './routes/search.js';

export interface AppDeps {
  createDocument: CreateDocumentUseCase;
  getDocument: GetDocumentUseCase;
  listDocuments: ListDocumentsUseCase;
  completeUpload: CompleteUploadUseCase;
  searchDocuments: SearchDocumentsUseCase;
  updateDocumentMetadata: UpdateDocumentMetadataUseCase;
  retryDocument: RetryDocumentUseCase;
}

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB, per section 14 (max size restriction)

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

  await app.register(swagger, {
    openapi: {
      info: { title: 'StudyDocs Pipeline API', version: '0.1.0' },
    },
  });

  await app.register(multipart, {
    limits: { fileSize: MAX_UPLOAD_BYTES },
  });

  app.get('/openapi.json', async () => app.swagger());
  app.get('/health', async () => ({ status: 'ok' }));

  registerDocumentRoutes(app, deps);
  registerSearchRoutes(app, deps);

  return app;
}
