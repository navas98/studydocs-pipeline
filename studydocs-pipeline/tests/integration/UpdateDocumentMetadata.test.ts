import type { Db, MongoClient } from 'mongodb';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CreateDocumentUseCase } from '../../src/application/documents/CreateDocument.js';
import { ConcurrencyConflictError } from '../../src/application/documents/errors.js';
import { UpdateDocumentMetadataUseCase } from '../../src/application/documents/UpdateDocumentMetadata.js';
import { connectMongo, ensureDocumentIndexes } from '../../src/infrastructure/mongodb/connection.js';
import { MongoDocumentRepository } from '../../src/infrastructure/mongodb/MongoDocumentRepository.js';

const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://localhost:27017/studydocs_test';

let mongoClient: MongoClient;
let db: Db;
let createDocument: CreateDocumentUseCase;
let updateMetadata: UpdateDocumentMetadataUseCase;

beforeAll(async () => {
  ({ client: mongoClient, db } = await connectMongo(MONGO_URI));
  await ensureDocumentIndexes(db);

  const repository = new MongoDocumentRepository(db);
  createDocument = new CreateDocumentUseCase(repository);
  updateMetadata = new UpdateDocumentMetadataUseCase(repository);
});

afterEach(async () => {
  await db.collection('documents').deleteMany({});
});

afterAll(async () => {
  await mongoClient.close();
});

describe('UpdateDocumentMetadataUseCase (real MongoDB)', () => {
  it('two clients reading the same version: the first write wins, the second gets a conflict', async () => {
    const document = await createDocument.execute({
      ownerId: 'owner-1',
      title: 'Apuntes de Álgebra',
      subject: 'Matemáticas',
      university: 'US',
      tags: [],
    });

    // Both clients "read" the document at version 0 (simulated by both
    // using the same expectedVersion, as if from an earlier GET).
    const clientAResult = await updateMetadata.execute({
      documentId: document.id,
      expectedVersion: 0,
      fields: { title: 'Título de cliente A' },
    });
    expect(clientAResult.toProps().title).toBe('Título de cliente A');
    expect(clientAResult.version).toBe(1);

    await expect(
      updateMetadata.execute({
        documentId: document.id,
        expectedVersion: 0,
        fields: { title: 'Título de cliente B' },
      }),
    ).rejects.toThrow(ConcurrencyConflictError);

    // Client B can retry after re-reading the current version.
    const retried = await updateMetadata.execute({
      documentId: document.id,
      expectedVersion: 1,
      fields: { title: 'Título de cliente B (reintento)' },
    });
    expect(retried.toProps().title).toBe('Título de cliente B (reintento)');
    expect(retried.version).toBe(2);
  });

  it('does not create a lost update: concurrent writes never both succeed', async () => {
    const document = await createDocument.execute({
      ownerId: 'owner-1',
      title: 'Apuntes',
      subject: 'Mates',
      university: 'US',
      tags: [],
    });

    const results = await Promise.allSettled([
      updateMetadata.execute({
        documentId: document.id,
        expectedVersion: 0,
        fields: { title: 'Escritura concurrente A' },
      }),
      updateMetadata.execute({
        documentId: document.id,
        expectedVersion: 0,
        fields: { title: 'Escritura concurrente B' },
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });
});
