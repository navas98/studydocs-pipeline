import { loadConfig } from '../config/env.js';
import { ProcessDocumentUseCase } from '../application/documents/ProcessDocument.js';
import { createS3Client, createSqsClient } from '../infrastructure/aws/clients.js';
import {
  createElasticsearchClient,
  ensureDocumentsIndex,
} from '../infrastructure/elasticsearch/connection.js';
import { ElasticsearchSearchIndex } from '../infrastructure/elasticsearch/ElasticsearchSearchIndex.js';
import { logger } from '../infrastructure/logging/logger.js';
import { PinoLogger } from '../infrastructure/logging/PinoLogger.js';
import { connectMongo, ensureDocumentIndexes } from '../infrastructure/mongodb/connection.js';
import { MongoDocumentRepository } from '../infrastructure/mongodb/MongoDocumentRepository.js';
import { PdfDocumentProcessor } from '../infrastructure/pdf/PdfDocumentProcessor.js';
import { S3ObjectStorage } from '../infrastructure/s3/S3ObjectStorage.js';
import { pollOnce } from './poll.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const { db } = await connectMongo(config.mongoUri);
  await ensureDocumentIndexes(db);

  const esClient = createElasticsearchClient(config.elasticsearchNode);
  await ensureDocumentsIndex(esClient);

  const awsClientConfig = {
    region: config.awsRegion,
    ...(config.awsEndpoint ? { endpoint: config.awsEndpoint } : {}),
  };
  const sqsClient = createSqsClient(awsClientConfig);
  const storage = new S3ObjectStorage(createS3Client(awsClientConfig), config.s3Bucket);
  const repository = new MongoDocumentRepository(db);
  const searchIndex = new ElasticsearchSearchIndex(esClient);
  const useCase = new ProcessDocumentUseCase(
    repository,
    new PdfDocumentProcessor(storage, searchIndex),
    new PinoLogger(logger),
  );

  logger.info({ queueUrl: config.sqsQueueUrl }, 'worker started, polling');

  while (true) {
    try {
      await pollOnce(sqsClient, config.sqsQueueUrl, useCase);
    } catch (error) {
      logger.error({ err: error }, 'worker poll failed');
    }
  }
}

main().catch((error: unknown) => {
  logger.error({ err: error }, 'worker crashed');
  process.exit(1);
});
