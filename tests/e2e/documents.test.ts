import type { FastifyInstance } from 'fastify';
import type { Db, MongoClient } from 'mongodb';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CompleteUploadUseCase } from '../../src/application/documents/CompleteUpload.js';
import { CreateDocumentUseCase } from '../../src/application/documents/CreateDocument.js';
import { DeleteDocumentUseCase } from '../../src/application/documents/DeleteDocument.js';
import { DownloadDocumentFileUseCase } from '../../src/application/documents/DownloadDocumentFile.js';
import { GetDocumentUseCase } from '../../src/application/documents/GetDocument.js';
import { ListDocumentsUseCase } from '../../src/application/documents/ListDocuments.js';
import { ProcessDocumentUseCase } from '../../src/application/documents/ProcessDocument.js';
import { RetryDocumentUseCase } from '../../src/application/documents/RetryDocument.js';
import { SearchDocumentsUseCase } from '../../src/application/documents/SearchDocuments.js';
import { UpdateDocumentMetadataUseCase } from '../../src/application/documents/UpdateDocumentMetadata.js';
import { buildApp } from '../../src/interfaces/http/app.js';
import { createCheckHealth } from '../../src/interfaces/http/health.js';
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
import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';

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

let client: MongoClient;
let db: Db;
let app: FastifyInstance;
let processDocument: ProcessDocumentUseCase;
let sqsClient: SQSClient;

beforeAll(async () => {
  ({ client, db } = await connectMongo(MONGO_URI));
  await ensureDocumentIndexes(db);

  const repository = new MongoDocumentRepository(db);
  const awsConfig = { region: 'us-east-1', endpoint: AWS_ENDPOINT };
  const storage = new S3ObjectStorage(createS3Client(awsConfig), S3_BUCKET);
  sqsClient = createSqsClient(awsConfig);
  const queue = new SqsDocumentQueue(sqsClient, SQS_QUEUE_URL);
  const esClient = createElasticsearchClient(ELASTICSEARCH_NODE);
  await ensureDocumentsIndex(esClient, ELASTICSEARCH_INDEX);
  const searchIndex = new ElasticsearchSearchIndex(esClient, ELASTICSEARCH_INDEX);
  processDocument = new ProcessDocumentUseCase(
    repository,
    new PdfDocumentProcessor(storage, searchIndex),
    new PinoLogger(logger),
  );

  app = await buildApp({
    createDocument: new CreateDocumentUseCase(repository),
    getDocument: new GetDocumentUseCase(repository),
    listDocuments: new ListDocumentsUseCase(repository),
    completeUpload: new CompleteUploadUseCase(repository, storage, queue),
    searchDocuments: new SearchDocumentsUseCase(searchIndex),
    updateDocumentMetadata: new UpdateDocumentMetadataUseCase(repository),
    retryDocument: new RetryDocumentUseCase(repository, queue),
    downloadDocumentFile: new DownloadDocumentFileUseCase(repository, storage),
    deleteDocument: new DeleteDocumentUseCase(repository, storage, searchIndex),
    checkHealth: createCheckHealth(db, esClient),
  });
  await app.ready();
});

afterEach(async () => {
  await db.collection('documents').deleteMany({});
});

afterAll(async () => {
  await app.close();
  await client.close();
});

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

function buildMultipartUpload(content: string, mimeType = 'application/pdf') {
  const boundary = '----studydocsTestBoundary';
  const body = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="test.pdf"',
    `Content-Type: ${mimeType}`,
    '',
    content,
    `--${boundary}--`,
    '',
  ].join('\r\n');

  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    ownerId: 'owner-1',
    title: 'Apuntes de Álgebra',
    subject: 'Matemáticas',
    university: 'US',
    tags: ['algebra'],
    ...overrides,
  };
}

describe('Documents HTTP API', () => {
  it('creates a document and returns 201 with the created resource', async () => {
    const response = await app.inject({ method: 'POST', url: '/documents', payload: validPayload() });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.status).toBe('CREATED');
    expect(body.title).toBe('Apuntes de Álgebra');
  });

  it('rejects a create request missing required fields with a 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/documents',
      payload: { ownerId: 'owner-1' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('retrieves a created document by id', async () => {
    const created = await app.inject({ method: 'POST', url: '/documents', payload: validPayload() });
    const { id } = created.json();

    const response = await app.inject({ method: 'GET', url: `/documents/${id}` });

    expect(response.statusCode).toBe(200);
    expect(response.json().id).toBe(id);
  });

  it('returns 404 for an id that does not exist', async () => {
    const response = await app.inject({ method: 'GET', url: '/documents/does-not-exist' });
    expect(response.statusCode).toBe(404);
  });

  it('updates metadata when the version matches', async () => {
    const created = await app.inject({ method: 'POST', url: '/documents', payload: validPayload() });
    const { id } = created.json();

    const response = await app.inject({
      method: 'PATCH',
      url: `/documents/${id}`,
      payload: { version: 0, title: 'Título actualizado' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.title).toBe('Título actualizado');
    expect(body.version).toBe(1);
  });

  it('returns 409 when the version is stale (optimistic concurrency conflict)', async () => {
    const created = await app.inject({ method: 'POST', url: '/documents', payload: validPayload() });
    const { id } = created.json();

    await app.inject({
      method: 'PATCH',
      url: `/documents/${id}`,
      payload: { version: 0, title: 'Cambio de cliente A' },
    });

    const response = await app.inject({
      method: 'PATCH',
      url: `/documents/${id}`,
      payload: { version: 0, title: 'Cambio de cliente B' },
    });

    expect(response.statusCode).toBe(409);
  });

  it('returns 404 when updating a document that does not exist', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/documents/does-not-exist',
      payload: { version: 0, title: 'x' },
    });

    expect(response.statusCode).toBe(404);
  });

  it('lists documents scoped to the requested owner', async () => {
    await app.inject({ method: 'POST', url: '/documents', payload: validPayload() });
    await app.inject({
      method: 'POST',
      url: '/documents',
      payload: validPayload({ ownerId: 'someone-else' }),
    });

    const response = await app.inject({ method: 'GET', url: '/documents?ownerId=owner-1' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveLength(1);
    expect(body[0].ownerId).toBe('owner-1');
  });

  it('serves an OpenAPI document', async () => {
    const response = await app.inject({ method: 'GET', url: '/openapi.json' });
    expect(response.statusCode).toBe(200);
    expect(response.json().openapi).toBeDefined();
  });

  it('reports healthy when Mongo and Elasticsearch are reachable', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', checks: { mongo: 'ok', elasticsearch: 'ok' } });
  });

  it('completes an upload and moves the document to QUEUED', async () => {
    const created = await app.inject({ method: 'POST', url: '/documents', payload: validPayload() });
    const { id } = created.json();
    const { body, contentType } = buildMultipartUpload('%PDF-1.4 fake content');

    const response = await app.inject({
      method: 'POST',
      url: `/documents/${id}/complete-upload`,
      headers: { 'content-type': contentType },
      payload: body,
    });

    expect(response.statusCode).toBe(202);
    expect(response.json().status).toBe('QUEUED');
  });

  it('rejects a non-PDF upload with 415', async () => {
    const created = await app.inject({ method: 'POST', url: '/documents', payload: validPayload() });
    const { id } = created.json();
    const { body, contentType } = buildMultipartUpload('not a pdf', 'text/plain');

    const response = await app.inject({
      method: 'POST',
      url: `/documents/${id}/complete-upload`,
      headers: { 'content-type': contentType },
      payload: body,
    });

    expect(response.statusCode).toBe(415);
  });

  it('returns 404 when completing an upload for a document that does not exist', async () => {
    const { body, contentType } = buildMultipartUpload('%PDF-1.4 fake content');

    const response = await app.inject({
      method: 'POST',
      url: '/documents/does-not-exist/complete-upload',
      headers: { 'content-type': contentType },
      payload: body,
    });

    expect(response.statusCode).toBe(404);
  });

  it('retries a FAILED document and moves it back to QUEUED', async () => {
    const created = await app.inject({ method: 'POST', url: '/documents', payload: validPayload() });
    const { id } = created.json();
    const { body, contentType } = buildMultipartUpload('not actually a pdf');
    await app.inject({
      method: 'POST',
      url: `/documents/${id}/complete-upload`,
      headers: { 'content-type': contentType },
      payload: body,
    });

    // Drive it to FAILED directly (bypassing the SQS hop, like search.test.ts does).
    await processDocument.execute(id, 'test-correlation-id');
    const failed = await app.inject({ method: 'GET', url: `/documents/${id}` });
    expect(failed.json().status).toBe('FAILED');

    const response = await app.inject({ method: 'POST', url: `/documents/${id}/retry` });

    expect(response.statusCode).toBe(202);
    const retried = response.json();
    expect(retried.status).toBe('QUEUED');
    expect(retried.processingAttempts).toBe(0);
    expect(retried.failureReason).toBeNull();
  });

  it('returns 409 when retrying a document that is not FAILED', async () => {
    const created = await app.inject({ method: 'POST', url: '/documents', payload: validPayload() });
    const { id } = created.json();

    const response = await app.inject({ method: 'POST', url: `/documents/${id}/retry` });

    expect(response.statusCode).toBe(409);
  });

  it('returns 404 when retrying a document that does not exist', async () => {
    const response = await app.inject({ method: 'POST', url: '/documents/does-not-exist/retry' });
    expect(response.statusCode).toBe(404);
  });

  it('propagates a caller-supplied correlation id from the request to the SQS message and echoes it back', async () => {
    await purgeQueue();
    const created = await app.inject({ method: 'POST', url: '/documents', payload: validPayload() });
    const { id } = created.json();
    const { body, contentType } = buildMultipartUpload('%PDF-1.4 fake content');
    const correlationId = 'my-custom-correlation-id';

    const response = await app.inject({
      method: 'POST',
      url: `/documents/${id}/complete-upload`,
      headers: { 'content-type': contentType, 'x-correlation-id': correlationId },
      payload: body,
    });

    expect(response.headers['x-correlation-id']).toBe(correlationId);

    const received = await sqsClient.send(
      new ReceiveMessageCommand({ QueueUrl: SQS_QUEUE_URL, MaxNumberOfMessages: 1, WaitTimeSeconds: 2 }),
    );
    const message = JSON.parse(received.Messages?.[0]?.Body ?? '{}');
    expect(message.correlationId).toBe(correlationId);

    await purgeQueue();
  });

  it('generates a correlation id when the caller does not supply one', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.headers['x-correlation-id']).toBeDefined();
  });

  it('serves the uploaded PDF for viewing', async () => {
    const created = await app.inject({ method: 'POST', url: '/documents', payload: validPayload() });
    const { id } = created.json();
    const { body, contentType } = buildMultipartUpload('%PDF-1.4 real content');
    await app.inject({
      method: 'POST',
      url: `/documents/${id}/complete-upload`,
      headers: { 'content-type': contentType },
      payload: body,
    });

    const response = await app.inject({ method: 'GET', url: `/documents/${id}/file` });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-disposition']).toContain('inline');
    expect(response.body).toContain('%PDF-1.4 real content');
  });

  it('returns 404 when viewing the file of a document that does not exist', async () => {
    const response = await app.inject({ method: 'GET', url: '/documents/does-not-exist/file' });
    expect(response.statusCode).toBe(404);
  });

  it('returns 404 when viewing the file of a document with no upload yet', async () => {
    const created = await app.inject({ method: 'POST', url: '/documents', payload: validPayload() });
    const { id } = created.json();

    const response = await app.inject({ method: 'GET', url: `/documents/${id}/file` });

    expect(response.statusCode).toBe(404);
  });

  it('deletes a document with an uploaded file', async () => {
    const created = await app.inject({ method: 'POST', url: '/documents', payload: validPayload() });
    const { id } = created.json();
    const { body, contentType } = buildMultipartUpload('%PDF-1.4 real content');
    await app.inject({
      method: 'POST',
      url: `/documents/${id}/complete-upload`,
      headers: { 'content-type': contentType },
      payload: body,
    });

    const response = await app.inject({ method: 'DELETE', url: `/documents/${id}` });
    expect(response.statusCode).toBe(204);

    const afterDelete = await app.inject({ method: 'GET', url: `/documents/${id}` });
    expect(afterDelete.statusCode).toBe(404);
    const fileAfterDelete = await app.inject({ method: 'GET', url: `/documents/${id}/file` });
    expect(fileAfterDelete.statusCode).toBe(404);
  });

  it('deletes a document that never had a file uploaded', async () => {
    const created = await app.inject({ method: 'POST', url: '/documents', payload: validPayload() });
    const { id } = created.json();

    const response = await app.inject({ method: 'DELETE', url: `/documents/${id}` });

    expect(response.statusCode).toBe(204);
    const afterDelete = await app.inject({ method: 'GET', url: `/documents/${id}` });
    expect(afterDelete.statusCode).toBe(404);
  });

  it('returns 404 when deleting a document that does not exist', async () => {
    const response = await app.inject({ method: 'DELETE', url: '/documents/does-not-exist' });
    expect(response.statusCode).toBe(404);
  });
});
