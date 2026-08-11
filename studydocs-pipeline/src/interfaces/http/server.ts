import { loadConfig } from '../../config/env.js';
import { CompleteUploadUseCase } from '../../application/documents/CompleteUpload.js';
import { CreateDocumentUseCase } from '../../application/documents/CreateDocument.js';
import { GetDocumentUseCase } from '../../application/documents/GetDocument.js';
import { ListDocumentsUseCase } from '../../application/documents/ListDocuments.js';
import { createS3Client, createSqsClient } from '../../infrastructure/aws/clients.js';
import { connectMongo, ensureDocumentIndexes } from '../../infrastructure/mongodb/connection.js';
import { MongoDocumentRepository } from '../../infrastructure/mongodb/MongoDocumentRepository.js';
import { S3ObjectStorage } from '../../infrastructure/s3/S3ObjectStorage.js';
import { SqsDocumentQueue } from '../../infrastructure/sqs/SqsDocumentQueue.js';
import { buildApp } from './app.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const { db } = await connectMongo(config.mongoUri);
  await ensureDocumentIndexes(db);

  const repository = new MongoDocumentRepository(db);
  const awsClientConfig = {
    region: config.awsRegion,
    ...(config.awsEndpoint ? { endpoint: config.awsEndpoint } : {}),
  };
  const storage = new S3ObjectStorage(createS3Client(awsClientConfig), config.s3Bucket);
  const queue = new SqsDocumentQueue(createSqsClient(awsClientConfig), config.sqsQueueUrl);

  const app = await buildApp({
    createDocument: new CreateDocumentUseCase(repository),
    getDocument: new GetDocumentUseCase(repository),
    listDocuments: new ListDocumentsUseCase(repository),
    completeUpload: new CompleteUploadUseCase(repository, storage, queue),
  });

  await app.listen({ port: config.port, host: '0.0.0.0' });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
