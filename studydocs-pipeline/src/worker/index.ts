import { loadConfig } from '../config/env.js';
import { ProcessDocumentUseCase } from '../application/documents/ProcessDocument.js';
import { createS3Client, createSqsClient } from '../infrastructure/aws/clients.js';
import { connectMongo, ensureDocumentIndexes } from '../infrastructure/mongodb/connection.js';
import { MongoDocumentRepository } from '../infrastructure/mongodb/MongoDocumentRepository.js';
import { PdfDocumentProcessor } from '../infrastructure/pdf/PdfDocumentProcessor.js';
import { S3ObjectStorage } from '../infrastructure/s3/S3ObjectStorage.js';
import { pollOnce } from './poll.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const { db } = await connectMongo(config.mongoUri);
  await ensureDocumentIndexes(db);

  const awsClientConfig = {
    region: config.awsRegion,
    ...(config.awsEndpoint ? { endpoint: config.awsEndpoint } : {}),
  };
  const sqsClient = createSqsClient(awsClientConfig);
  const storage = new S3ObjectStorage(createS3Client(awsClientConfig), config.s3Bucket);
  const repository = new MongoDocumentRepository(db);
  const useCase = new ProcessDocumentUseCase(repository, new PdfDocumentProcessor(storage));

  console.log('Worker started, polling', config.sqsQueueUrl);

  while (true) {
    try {
      await pollOnce(sqsClient, config.sqsQueueUrl, useCase);
    } catch (error) {
      console.error('Worker poll failed', error);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
