import type { MongoClient, Db } from 'mongodb';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Chunk } from '../../src/domain/document/Chunk.js';
import { connectMongo, ensureChunkIndexes } from '../../src/infrastructure/mongodb/connection.js';
import { MongoChunkRepository } from '../../src/infrastructure/mongodb/MongoChunkRepository.js';

const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://localhost:27017/studydocs_test';

let client: MongoClient;
let db: Db;
let repository: MongoChunkRepository;

beforeAll(async () => {
  ({ client, db } = await connectMongo(MONGO_URI));
  await ensureChunkIndexes(db);
  repository = new MongoChunkRepository(db);
});

afterEach(async () => {
  await db.collection('chunks').deleteMany({});
});

afterAll(async () => {
  await client.close();
});

function buildChunk(overrides: Partial<{ documentId: string; position: number; content: string }> = {}): Chunk {
  return Chunk.create({
    documentId: overrides.documentId ?? 'doc-1',
    ownerId: 'owner-1',
    page: 1,
    position: overrides.position ?? 0,
    content: overrides.content ?? 'contenido de prueba',
  });
}

describe('MongoChunkRepository', () => {
  it('saves and retrieves chunks for a document, ordered by position', async () => {
    await repository.saveMany([
      buildChunk({ documentId: 'doc-1', position: 1, content: 'segundo' }),
      buildChunk({ documentId: 'doc-1', position: 0, content: 'primero' }),
    ]);

    const found = await repository.findByDocumentId('doc-1');

    expect(found.map((chunk) => chunk.content)).toEqual(['primero', 'segundo']);
  });

  it('does not return chunks belonging to a different document', async () => {
    await repository.saveMany([buildChunk({ documentId: 'doc-1' }), buildChunk({ documentId: 'doc-2' })]);

    const found = await repository.findByDocumentId('doc-1');

    expect(found).toHaveLength(1);
  });

  it('deletes all chunks for a document', async () => {
    await repository.saveMany([
      buildChunk({ documentId: 'doc-1', position: 0 }),
      buildChunk({ documentId: 'doc-1', position: 1 }),
    ]);

    await repository.deleteByDocumentId('doc-1');

    expect(await repository.findByDocumentId('doc-1')).toEqual([]);
  });

  it('is a no-op when saving an empty array', async () => {
    await expect(repository.saveMany([])).resolves.toBeUndefined();
  });
});
