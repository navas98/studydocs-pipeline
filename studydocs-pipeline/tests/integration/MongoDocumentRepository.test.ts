import type { MongoClient, Db } from 'mongodb';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CreateDocumentUseCase } from '../../src/application/documents/CreateDocument.js';
import { Document } from '../../src/domain/document/Document.js';
import { connectMongo, ensureDocumentIndexes } from '../../src/infrastructure/mongodb/connection.js';
import { MongoDocumentRepository } from '../../src/infrastructure/mongodb/MongoDocumentRepository.js';

const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://localhost:27017/studydocs_test';

let client: MongoClient;
let db: Db;
let repository: MongoDocumentRepository;

beforeAll(async () => {
  ({ client, db } = await connectMongo(MONGO_URI));
  await ensureDocumentIndexes(db);
  repository = new MongoDocumentRepository(db);
});

afterEach(async () => {
  await db.collection('documents').deleteMany({});
});

afterAll(async () => {
  await client.close();
});

function buildCommand(overrides: Partial<{ ownerId: string }> = {}) {
  return {
    ownerId: overrides.ownerId ?? 'owner-1',
    title: 'Apuntes de Álgebra',
    subject: 'Matemáticas',
    university: 'US',
    tags: ['algebra', 'examen'],
  };
}

describe('MongoDocumentRepository', () => {
  it('persists a document created via the use case and reads it back', async () => {
    const useCase = new CreateDocumentUseCase(repository);

    const created = await useCase.execute(buildCommand());
    const found = await repository.findById(created.id);

    expect(found).not.toBeNull();
    expect(found?.toProps()).toEqual(created.toProps());
  });

  it('returns null for an id that does not exist', async () => {
    const found = await repository.findById('does-not-exist');
    expect(found).toBeNull();
  });

  it('overwrites the stored version when saving the same document again', async () => {
    const document = Document.create(buildCommand());
    await repository.save(document);

    document.startUpload('s3://bucket/key.pdf', 'application/pdf', 1024);
    await repository.save(document);

    const found = await repository.findById(document.id);
    expect(found?.status).toBe('UPLOADING');
    expect(found?.version).toBe(1);
  });

  it('lists documents by owner ordered by most recent first', async () => {
    const useCase = new CreateDocumentUseCase(repository);
    const first = await useCase.execute(buildCommand());
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await useCase.execute(buildCommand());
    await useCase.execute(buildCommand({ ownerId: 'someone-else' }));

    const results = await repository.findByOwner('owner-1', { limit: 10, offset: 0 });

    expect(results.map((d) => d.id)).toEqual([second.id, first.id]);
  });
});
