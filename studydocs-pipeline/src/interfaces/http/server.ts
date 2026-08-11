import { loadConfig } from '../../config/env.js';
import { CreateDocumentUseCase } from '../../application/documents/CreateDocument.js';
import { GetDocumentUseCase } from '../../application/documents/GetDocument.js';
import { ListDocumentsUseCase } from '../../application/documents/ListDocuments.js';
import { connectMongo, ensureDocumentIndexes } from '../../infrastructure/mongodb/connection.js';
import { MongoDocumentRepository } from '../../infrastructure/mongodb/MongoDocumentRepository.js';
import { buildApp } from './app.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const { db } = await connectMongo(config.mongoUri);
  await ensureDocumentIndexes(db);

  const repository = new MongoDocumentRepository(db);
  const app = await buildApp({
    createDocument: new CreateDocumentUseCase(repository),
    getDocument: new GetDocumentUseCase(repository),
    listDocuments: new ListDocumentsUseCase(repository),
  });

  await app.listen({ port: config.port, host: '0.0.0.0' });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
