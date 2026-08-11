import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import type { CompleteUploadUseCase } from '../../application/documents/CompleteUpload.js';
import type { CreateDocumentUseCase } from '../../application/documents/CreateDocument.js';
import type { GetDocumentUseCase } from '../../application/documents/GetDocument.js';
import type { ListDocumentsUseCase } from '../../application/documents/ListDocuments.js';
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
}

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB, per section 14 (max size restriction)

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

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
