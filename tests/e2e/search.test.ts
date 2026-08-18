import type { Client } from '@elastic/elasticsearch';
import type { FastifyInstance } from 'fastify';
import type { Db, MongoClient } from 'mongodb';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { LoginUserUseCase } from '../../src/application/auth/LoginUser.js';
import { RegisterUserUseCase } from '../../src/application/auth/RegisterUser.js';
import { CompleteUploadUseCase } from '../../src/application/documents/CompleteUpload.js';
import { CreateDocumentUseCase } from '../../src/application/documents/CreateDocument.js';
import { DeleteDocumentUseCase } from '../../src/application/documents/DeleteDocument.js';
import { DownloadDocumentFileUseCase } from '../../src/application/documents/DownloadDocumentFile.js';
import { GetDocumentUseCase } from '../../src/application/documents/GetDocument.js';
import { ListDocumentsUseCase } from '../../src/application/documents/ListDocuments.js';
import { RetryDocumentUseCase } from '../../src/application/documents/RetryDocument.js';
import { SearchDocumentsUseCase } from '../../src/application/documents/SearchDocuments.js';
import { UpdateDocumentMetadataUseCase } from '../../src/application/documents/UpdateDocumentMetadata.js';
import { ProcessDocumentUseCase } from '../../src/application/documents/ProcessDocument.js';
import { buildApp } from '../../src/interfaces/http/app.js';
import { createAuthMiddleware } from '../../src/interfaces/http/authMiddleware.js';
import { createCheckHealth } from '../../src/interfaces/http/health.js';
import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { createS3Client, createSqsClient } from '../../src/infrastructure/aws/clients.js';
import { BcryptPasswordHasher } from '../../src/infrastructure/auth/BcryptPasswordHasher.js';
import { JwtTokenService } from '../../src/infrastructure/auth/JwtTokenService.js';
import {
  createElasticsearchClient,
  ensureDocumentsIndex,
} from '../../src/infrastructure/elasticsearch/connection.js';
import { ElasticsearchSearchIndex } from '../../src/infrastructure/elasticsearch/ElasticsearchSearchIndex.js';
import { logger } from '../../src/infrastructure/logging/logger.js';
import { PinoLogger } from '../../src/infrastructure/logging/PinoLogger.js';
import { connectMongo, ensureDocumentIndexes, ensureUserIndexes } from '../../src/infrastructure/mongodb/connection.js';
import { MongoDocumentRepository } from '../../src/infrastructure/mongodb/MongoDocumentRepository.js';
import { MongoUserRepository } from '../../src/infrastructure/mongodb/MongoUserRepository.js';
import { PdfDocumentProcessor } from '../../src/infrastructure/pdf/PdfDocumentProcessor.js';
import { S3ObjectStorage } from '../../src/infrastructure/s3/S3ObjectStorage.js';
import { SqsDocumentQueue } from '../../src/infrastructure/sqs/SqsDocumentQueue.js';

const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://localhost:27017/studydocs_test';
const AWS_ENDPOINT = process.env.AWS_ENDPOINT_URL ?? 'http://localhost:4566';
const S3_BUCKET = process.env.S3_BUCKET ?? 'studydocs-pdfs';
const SQS_QUEUE_URL =
  process.env.SQS_QUEUE_URL ??
  'http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/studydocs-processing';
const ELASTICSEARCH_NODE = process.env.ELASTICSEARCH_NODE ?? 'http://localhost:9200';
const ELASTICSEARCH_INDEX = process.env.ELASTICSEARCH_INDEX ?? 'documents_test';
const JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';

process.env.AWS_ACCESS_KEY_ID ??= 'test';
process.env.AWS_SECRET_ACCESS_KEY ??= 'test';

let mongoClient: MongoClient;
let db: Db;
let esClient: Client;
let sqsClient: SQSClient;
let app: FastifyInstance;
let processDocument: ProcessDocumentUseCase;
let authHeader: { authorization: string };

beforeAll(async () => {
  ({ client: mongoClient, db } = await connectMongo(MONGO_URI));
  await ensureDocumentIndexes(db);
  await ensureUserIndexes(db);
  await db.collection('users').deleteMany({});

  esClient = createElasticsearchClient(ELASTICSEARCH_NODE);
  await ensureDocumentsIndex(esClient, ELASTICSEARCH_INDEX);
  const searchIndex = new ElasticsearchSearchIndex(esClient, ELASTICSEARCH_INDEX);

  const repository = new MongoDocumentRepository(db);
  const users = new MongoUserRepository(db);
  const passwordHasher = new BcryptPasswordHasher();
  const tokens = new JwtTokenService(JWT_SECRET, '1h');
  const awsConfig = { region: 'us-east-1', endpoint: AWS_ENDPOINT };
  const storage = new S3ObjectStorage(createS3Client(awsConfig), S3_BUCKET);
  sqsClient = createSqsClient(awsConfig);
  const queue = new SqsDocumentQueue(sqsClient, SQS_QUEUE_URL);
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
    registerUser: new RegisterUserUseCase(users, passwordHasher),
    loginUser: new LoginUserUseCase(users, passwordHasher, tokens),
    authMiddleware: createAuthMiddleware(tokens),
  });
  await app.ready();

  const email = 'search-owner@test.dev';
  await app.inject({ method: 'POST', url: '/auth/register', payload: { email, password: 'password123' } });
  const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: 'password123' } });
  authHeader = { authorization: `Bearer ${login.json().accessToken}` };
});

afterEach(async () => {
  await db.collection('documents').deleteMany({});
  await esClient.deleteByQuery({
    index: ELASTICSEARCH_INDEX,
    query: { match_all: {} },
    refresh: true,
  });
  // completeUpload publishes a real SQS message per created document, which
  // this suite never consumes (it calls processDocument.execute() directly
  // instead); purge so those messages don't confuse other test files.
  await purgeQueue();
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

afterAll(async () => {
  await app.close();
  await mongoClient.close();
});

async function createIndexedDocument(overrides: Record<string, unknown> = {}) {
  const created = await app.inject({
    method: 'POST',
    url: '/documents',
    headers: authHeader,
    payload: {
      title: 'Apuntes de Álgebra',
      subject: 'Matemáticas',
      university: 'Universidad de Sevilla',
      tags: ['algebra'],
      ...overrides,
    },
  });
  const { id } = created.json();

  const boundary = '----searchTestBoundary';
  const body = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="test.pdf"',
    'Content-Type: application/pdf',
    '',
    '%PDF-1.4 fake content',
    `--${boundary}--`,
    '',
  ].join('\r\n');

  await app.inject({
    method: 'POST',
    url: `/documents/${id}/complete-upload`,
    headers: { ...authHeader, 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: body,
  });

  await processDocument.execute(id, 'test-correlation-id');
  return id;
}

describe('Search HTTP API', () => {
  it('finds an indexed document by full-text search', async () => {
    const id = await createIndexedDocument();

    const response = await app.inject({ method: 'GET', url: '/search?text=algebra', headers: authHeader });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.total).toBe(1);
    expect(body.items[0].documentId).toBe(id);
  });

  it('filters by subject', async () => {
    await createIndexedDocument({ subject: 'Matemáticas' });
    await createIndexedDocument({ title: 'Resumen de Física', subject: 'Física' });

    const response = await app.inject({ method: 'GET', url: '/search?subject=F%C3%ADsica', headers: authHeader });

    expect(response.statusCode).toBe(200);
    expect(response.json().total).toBe(1);
  });

  it('returns an empty result set for a search with no matches', async () => {
    const response = await app.inject({ method: 'GET', url: '/search?text=nonexistent-term-xyz', headers: authHeader });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ total: 0, items: [] });
  });

  it('removes a deleted document from search results', async () => {
    const id = await createIndexedDocument({ title: 'Apuntes de Trigonometría', tags: ['trigonometria'] });

    await app.inject({ method: 'DELETE', url: `/documents/${id}`, headers: authHeader });
    const response = await app.inject({ method: 'GET', url: '/search?text=trigonometria', headers: authHeader });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ total: 0, items: [] });
  });
});
