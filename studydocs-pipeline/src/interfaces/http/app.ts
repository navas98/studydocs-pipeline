import Fastify, { type FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import type { CreateDocumentUseCase } from '../../application/documents/CreateDocument.js';
import type { GetDocumentUseCase } from '../../application/documents/GetDocument.js';
import type { ListDocumentsUseCase } from '../../application/documents/ListDocuments.js';
import { registerDocumentRoutes } from './routes/documents.js';

export interface AppDeps {
  createDocument: CreateDocumentUseCase;
  getDocument: GetDocumentUseCase;
  listDocuments: ListDocumentsUseCase;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  await app.register(swagger, {
    openapi: {
      info: { title: 'StudyDocs Pipeline API', version: '0.1.0' },
    },
  });

  app.get('/openapi.json', async () => app.swagger());
  app.get('/health', async () => ({ status: 'ok' }));

  registerDocumentRoutes(app, deps);

  return app;
}
