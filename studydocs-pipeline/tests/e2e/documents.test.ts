import type { FastifyInstance } from 'fastify';
import type { Db, MongoClient } from 'mongodb';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CreateDocumentUseCase } from '../../src/application/documents/CreateDocument.js';
import { GetDocumentUseCase } from '../../src/application/documents/GetDocument.js';
import { ListDocumentsUseCase } from '../../src/application/documents/ListDocuments.js';
import { buildApp } from '../../src/interfaces/http/app.js';
import { connectMongo, ensureDocumentIndexes } from '../../src/infrastructure/mongodb/connection.js';
import { MongoDocumentRepository } from '../../src/infrastructure/mongodb/MongoDocumentRepository.js';

const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://localhost:27017/studydocs_test';

let client: MongoClient;
let db: Db;
let app: FastifyInstance;

beforeAll(async () => {
  ({ client, db } = await connectMongo(MONGO_URI));
  await ensureDocumentIndexes(db);

  const repository = new MongoDocumentRepository(db);
  app = await buildApp({
    createDocument: new CreateDocumentUseCase(repository),
    getDocument: new GetDocumentUseCase(repository),
    listDocuments: new ListDocumentsUseCase(repository),
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
});
