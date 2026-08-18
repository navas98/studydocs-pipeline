import type { Client } from '@elastic/elasticsearch';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createElasticsearchClient,
  ensureDocumentsIndex,
} from '../../src/infrastructure/elasticsearch/connection.js';
import { ElasticsearchSearchIndex } from '../../src/infrastructure/elasticsearch/ElasticsearchSearchIndex.js';
import { Document } from '../../src/domain/document/Document.js';

const ELASTICSEARCH_NODE = process.env.ELASTICSEARCH_NODE ?? 'http://localhost:9200';
const ELASTICSEARCH_INDEX = process.env.ELASTICSEARCH_INDEX ?? 'documents_test';

let client: Client;
let searchIndex: ElasticsearchSearchIndex;

beforeAll(async () => {
  client = createElasticsearchClient(ELASTICSEARCH_NODE);
  await ensureDocumentsIndex(client, ELASTICSEARCH_INDEX);
  searchIndex = new ElasticsearchSearchIndex(client, ELASTICSEARCH_INDEX);
});

afterEach(async () => {
  await client.deleteByQuery({
    index: ELASTICSEARCH_INDEX,
    query: { match_all: {} },
    refresh: true,
  });
});

function algebraDocument(): Document {
  const document = Document.create({
    ownerId: 'owner-1',
    title: 'Apuntes de Álgebra Lineal',
    subject: 'Matemáticas',
    university: 'Universidad de Sevilla',
    tags: ['algebra', 'examen'],
  });
  document.startUpload('documents/algebra.pdf', 'application/pdf', 10);
  document.enqueue();
  return document;
}

function physicsDocument(): Document {
  const document = Document.create({
    ownerId: 'owner-1',
    title: 'Resumen de Física Cuántica',
    subject: 'Física',
    university: 'Universidad Complutense',
    tags: ['fisica'],
  });
  document.startUpload('documents/fisica.pdf', 'application/pdf', 10);
  document.enqueue();
  return document;
}

describe('ElasticsearchSearchIndex (real Elasticsearch)', () => {
  it('finds a document via full-text search on its title', async () => {
    const document = algebraDocument();
    await searchIndex.index(document);

    const result = await searchIndex.search({ ownerId: 'owner-1', text: 'algebra', limit: 20, offset: 0 });

    expect(result.total).toBe(1);
    expect(result.items[0]?.documentId).toBe(document.id);
  });

  it('filters by exact subject', async () => {
    await searchIndex.index(algebraDocument());
    await searchIndex.index(physicsDocument());

    const result = await searchIndex.search({ ownerId: 'owner-1', subject: 'Física', limit: 20, offset: 0 });

    expect(result.total).toBe(1);
    expect(result.items[0]?.subject).toBe('Física');
  });

  it('filters by exact university', async () => {
    await searchIndex.index(algebraDocument());
    await searchIndex.index(physicsDocument());

    const result = await searchIndex.search({
      ownerId: 'owner-1',
      university: 'Universidad de Sevilla',
      limit: 20,
      offset: 0,
    });

    expect(result.total).toBe(1);
    expect(result.items[0]?.university).toBe('Universidad de Sevilla');
  });

  it('re-indexing the same document id updates it instead of duplicating it', async () => {
    const document = algebraDocument();
    await searchIndex.index(document);
    await searchIndex.index(document);

    const result = await searchIndex.search({ ownerId: 'owner-1', text: 'algebra', limit: 20, offset: 0 });
    expect(result.total).toBe(1);
  });

  it('paginates results', async () => {
    await searchIndex.index(algebraDocument());
    await searchIndex.index(physicsDocument());

    const page1 = await searchIndex.search({ ownerId: 'owner-1', limit: 1, offset: 0 });
    const page2 = await searchIndex.search({ ownerId: 'owner-1', limit: 1, offset: 1 });

    expect(page1.items).toHaveLength(1);
    expect(page2.items).toHaveLength(1);
    expect(page1.items[0]?.documentId).not.toBe(page2.items[0]?.documentId);
    expect(page1.total).toBe(2);
  });
});
