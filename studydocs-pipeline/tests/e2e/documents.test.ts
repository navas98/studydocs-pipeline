import type { FastifyInstance } from 'fastify';
import type { Db, MongoClient } from 'mongodb';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CompleteUploadUseCase } from '../../src/application/documents/CompleteUpload.js';
import { CreateDocumentUseCase } from '../../src/application/documents/CreateDocument.js';
import { GetDocumentUseCase } from '../../src/application/documents/GetDocument.js';
import { ListDocumentsUseCase } from '../../src/application/documents/ListDocuments.js';
import { buildApp } from '../../src/interfaces/http/app.js';
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

let client: MongoClient;
let db: Db;
let app: FastifyInstance;

beforeAll(async () => {
  ({ client, db } = await connectMongo(MONGO_URI));
  await ensureDocumentIndexes(db);

  const repository = new MongoDocumentRepository(db);
  const awsConfig = { region: 'us-east-1', endpoint: AWS_ENDPOINT };
  const storage = new S3ObjectStorage(createS3Client(awsConfig), S3_BUCKET);
  const queue = new SqsDocumentQueue(createSqsClient(awsConfig), SQS_QUEUE_URL);

  app = await buildApp({
    createDocument: new CreateDocumentUseCase(repository),
    getDocument: new GetDocumentUseCase(repository),
    listDocuments: new ListDocumentsUseCase(repository),
    completeUpload: new CompleteUploadUseCase(repository, storage, queue),
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

  it('exposes a health endpoint', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
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
});
