import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import type { Db, MongoClient } from 'mongodb';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CompleteUploadUseCase } from '../../src/application/documents/CompleteUpload.js';
import { CreateDocumentUseCase } from '../../src/application/documents/CreateDocument.js';
import { ProcessDocumentUseCase } from '../../src/application/documents/ProcessDocument.js';
import { createS3Client, createSqsClient } from '../../src/infrastructure/aws/clients.js';
import {
  createElasticsearchClient,
  ensureDocumentsIndex,
} from '../../src/infrastructure/elasticsearch/connection.js';
import { ElasticsearchSearchIndex } from '../../src/infrastructure/elasticsearch/ElasticsearchSearchIndex.js';
import { logger } from '../../src/infrastructure/logging/logger.js';
import { PinoLogger } from '../../src/infrastructure/logging/PinoLogger.js';
import { connectMongo, ensureDocumentIndexes } from '../../src/infrastructure/mongodb/connection.js';
import { MongoDocumentRepository } from '../../src/infrastructure/mongodb/MongoDocumentRepository.js';
import { PdfDocumentProcessor } from '../../src/infrastructure/pdf/PdfDocumentProcessor.js';
import { S3ObjectStorage } from '../../src/infrastructure/s3/S3ObjectStorage.js';
import { SqsDocumentQueue } from '../../src/infrastructure/sqs/SqsDocumentQueue.js';
import { pollOnce } from '../../src/worker/poll.js';

const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://localhost:27017/studydocs_test';
const AWS_ENDPOINT = process.env.AWS_ENDPOINT_URL ?? 'http://localhost:4566';
const S3_BUCKET = process.env.S3_BUCKET ?? 'studydocs-pdfs';
const SQS_QUEUE_URL =
  process.env.SQS_QUEUE_URL ??
  'http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/studydocs-processing';
const ELASTICSEARCH_NODE = process.env.ELASTICSEARCH_NODE ?? 'http://localhost:9200';
const ELASTICSEARCH_INDEX = process.env.ELASTICSEARCH_INDEX ?? 'documents_test';

process.env.AWS_ACCESS_KEY_ID ??= 'test';
process.env.AWS_SECRET_ACCESS_KEY ??= 'test';

let mongoClient: MongoClient;
let db: Db;
let sqsClient: SQSClient;
let createDocument: CreateDocumentUseCase;
let completeUpload: CompleteUploadUseCase;
let processDocument: ProcessDocumentUseCase;

beforeAll(async () => {
  ({ client: mongoClient, db } = await connectMongo(MONGO_URI));
  await ensureDocumentIndexes(db);

  const awsConfig = { region: 'us-east-1', endpoint: AWS_ENDPOINT };
  const s3Client = createS3Client(awsConfig);
  sqsClient = createSqsClient(awsConfig);
  const storage = new S3ObjectStorage(s3Client, S3_BUCKET);

  const esClient = createElasticsearchClient(ELASTICSEARCH_NODE);
  await ensureDocumentsIndex(esClient, ELASTICSEARCH_INDEX);
  const searchIndex = new ElasticsearchSearchIndex(esClient, ELASTICSEARCH_INDEX);

  const repository = new MongoDocumentRepository(db);
  createDocument = new CreateDocumentUseCase(repository);
  completeUpload = new CompleteUploadUseCase(repository, storage, new SqsDocumentQueue(sqsClient, SQS_QUEUE_URL));
  processDocument = new ProcessDocumentUseCase(
    repository,
    new PdfDocumentProcessor(storage, searchIndex),
    new PinoLogger(logger),
  );
});

beforeEach(async () => {
  await purgeQueue();
});

afterEach(async () => {
  await db.collection('documents').deleteMany({});
});

afterAll(async () => {
  await mongoClient.close();
});

// LocalStack persists queue contents across `npm test` runs (see the
// localstack-data volume in docker-compose.yml), so stale messages from a
// previous failed run can otherwise be picked up by pollOnce() ahead of the
// message a test just published, leaving the test's own document stuck.
async function purgeQueue(): Promise<void> {
  let result = await sqsClient.send(
    new ReceiveMessageCommand({ QueueUrl: SQS_QUEUE_URL, MaxNumberOfMessages: 10, WaitTimeSeconds: 1 }),
  );
  while (result.Messages?.length) {
    await Promise.all(
      result.Messages.map((message) =>
        sqsClient.send(
          new DeleteMessageCommand({ QueueUrl: SQS_QUEUE_URL, ReceiptHandle: message.ReceiptHandle! }),
        ),
      ),
    );
    result = await sqsClient.send(
      new ReceiveMessageCommand({ QueueUrl: SQS_QUEUE_URL, MaxNumberOfMessages: 10, WaitTimeSeconds: 1 }),
    );
  }
}

async function drainQueue(): Promise<number> {
  const result = await sqsClient.send(
    new ReceiveMessageCommand({ QueueUrl: SQS_QUEUE_URL, MaxNumberOfMessages: 10, WaitTimeSeconds: 1 }),
  );
  return result.Messages?.length ?? 0;
}

describe('worker pollOnce (real Mongo + S3 + SQS via LocalStack)', () => {
  it('processes a queued document end to end and removes the message from the queue', async () => {
    const document = await createDocument.execute({
      ownerId: 'owner-1',
      title: 'Apuntes',
      subject: 'Mates',
      university: 'US',
      tags: [],
    });
    await completeUpload.execute({
      documentId: document.id,
      file: Buffer.from('%PDF-1.4 real-looking content'),
      mimeType: 'application/pdf',
    });

    await pollOnce(sqsClient, SQS_QUEUE_URL, processDocument);

    const repository = new MongoDocumentRepository(db);
    const stored = await repository.findById(document.id);
    expect(stored?.status).toBe('INDEXED');
    expect(await drainQueue()).toBe(0);
  });

  it('fails a document permanently when the uploaded file is not a real PDF and removes the message', async () => {
    const document = await createDocument.execute({
      ownerId: 'owner-1',
      title: 'Apuntes',
      subject: 'Mates',
      university: 'US',
      tags: [],
    });
    await completeUpload.execute({
      documentId: document.id,
      file: Buffer.from('definitely not a pdf'),
      mimeType: 'application/pdf',
    });

    await pollOnce(sqsClient, SQS_QUEUE_URL, processDocument);

    const repository = new MongoDocumentRepository(db);
    const stored = await repository.findById(document.id);
    expect(stored?.status).toBe('FAILED');
    expect(await drainQueue()).toBe(0);
  });
});
