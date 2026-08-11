import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import type { Db, MongoClient } from 'mongodb';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CompleteUploadUseCase } from '../../src/application/documents/CompleteUpload.js';
import { CreateDocumentUseCase } from '../../src/application/documents/CreateDocument.js';
import { DocumentNotFoundError } from '../../src/application/documents/errors.js';
import { InvalidDocumentTransitionError } from '../../src/domain/document/errors.js';
import { createS3Client, createSqsClient } from '../../src/infrastructure/aws/clients.js';
import { connectMongo, ensureDocumentIndexes } from '../../src/infrastructure/mongodb/connection.js';
import { MongoDocumentRepository } from '../../src/infrastructure/mongodb/MongoDocumentRepository.js';
import { S3ObjectStorage } from '../../src/infrastructure/s3/S3ObjectStorage.js';
import { SqsDocumentQueue } from '../../src/infrastructure/sqs/SqsDocumentQueue.js';

const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://localhost:27017/studydocs_test';
const AWS_ENDPOINT = process.env.AWS_ENDPOINT_URL ?? 'http://localhost:4566';
const S3_BUCKET = process.env.S3_BUCKET ?? 'studydocs-pdfs';
const SQS_QUEUE_URL =
  process.env.SQS_QUEUE_URL ??
  'http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/studydocs-processing';

process.env.AWS_ACCESS_KEY_ID ??= 'test';
process.env.AWS_SECRET_ACCESS_KEY ??= 'test';

let mongoClient: MongoClient;
let db: Db;
let s3Client: S3Client;
let sqsClient: SQSClient;
let useCase: CompleteUploadUseCase;
let createDocument: CreateDocumentUseCase;

beforeAll(async () => {
  ({ client: mongoClient, db } = await connectMongo(MONGO_URI));
  await ensureDocumentIndexes(db);

  const awsConfig = { region: 'us-east-1', endpoint: AWS_ENDPOINT };
  s3Client = createS3Client(awsConfig);
  sqsClient = createSqsClient(awsConfig);

  const repository = new MongoDocumentRepository(db);
  createDocument = new CreateDocumentUseCase(repository);
  useCase = new CompleteUploadUseCase(
    repository,
    new S3ObjectStorage(s3Client, S3_BUCKET),
    new SqsDocumentQueue(sqsClient, SQS_QUEUE_URL),
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

// Receiving a message only hides it for the visibility timeout; it doesn't
// remove it. LocalStack also persists queue contents across `npm test` runs
// (see the localstack-data volume in docker-compose.yml), so without an
// actual delete, messages from other tests/files or previous runs can
// resurface here and get mistaken for the message this test just published.
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

describe('CompleteUploadUseCase (S3 + SQS via LocalStack)', () => {
  it('stores the file in S3, transitions to QUEUED and publishes a processing message', async () => {
    const document = await createDocument.execute({
      ownerId: 'owner-1',
      title: 'Apuntes',
      subject: 'Mates',
      university: 'US',
      tags: [],
    });

    const result = await useCase.execute({
      documentId: document.id,
      file: Buffer.from('%PDF-1.4 fake pdf content'),
      mimeType: 'application/pdf',
    });

    expect(result.status).toBe('QUEUED');
    expect(result.version).toBe(2); // CREATED -> UPLOADING -> QUEUED

    const stored = await s3Client.send(
      new GetObjectCommand({ Bucket: S3_BUCKET, Key: `documents/${document.id}.pdf` }),
    );
    expect(await stored.Body?.transformToString()).toContain('fake pdf content');

    const received = await sqsClient.send(
      new ReceiveMessageCommand({ QueueUrl: SQS_QUEUE_URL, MaxNumberOfMessages: 1, WaitTimeSeconds: 2 }),
    );
    expect(received.Messages).toHaveLength(1);
    const body = JSON.parse(received.Messages?.[0]?.Body ?? '{}');
    expect(body.documentId).toBe(document.id);
    expect(body.correlationId).toBeDefined();
  });

  it('throws DocumentNotFoundError for a document that does not exist', async () => {
    await expect(
      useCase.execute({
        documentId: 'missing',
        file: Buffer.from('x'),
        mimeType: 'application/pdf',
      }),
    ).rejects.toThrow(DocumentNotFoundError);
  });

  it('throws InvalidDocumentTransitionError when uploading twice', async () => {
    const document = await createDocument.execute({
      ownerId: 'owner-1',
      title: 'Apuntes',
      subject: 'Mates',
      university: 'US',
      tags: [],
    });

    await useCase.execute({
      documentId: document.id,
      file: Buffer.from('first'),
      mimeType: 'application/pdf',
    });

    await expect(
      useCase.execute({
        documentId: document.id,
        file: Buffer.from('second'),
        mimeType: 'application/pdf',
      }),
    ).rejects.toThrow(InvalidDocumentTransitionError);
  });
});
