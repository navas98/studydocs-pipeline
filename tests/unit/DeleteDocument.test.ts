import { describe, expect, it } from 'vitest';
import type { DocumentRepository } from '../../src/application/documents/DocumentRepository.js';
import { DeleteDocumentUseCase } from '../../src/application/documents/DeleteDocument.js';
import { DocumentNotFoundError } from '../../src/application/documents/errors.js';
import type { ObjectStorage } from '../../src/application/documents/ObjectStorage.js';
import type { SearchIndex, SearchResult } from '../../src/application/documents/SearchIndex.js';
import { Document } from '../../src/domain/document/Document.js';

class InMemoryDocumentRepository implements DocumentRepository {
  private readonly store = new Map<string, ReturnType<Document['toProps']>>();

  async save(document: Document): Promise<void> {
    this.store.set(document.id, document.toProps());
  }

  async findById(id: string): Promise<Document | null> {
    const props = this.store.get(id);
    return props ? Document.fromProps(props) : null;
  }

  async findByOwner(): Promise<Document[]> {
    return [];
  }

  async updateWithVersionCheck(): Promise<boolean> {
    throw new Error('not used in this test');
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }

  has(id: string): boolean {
    return this.store.has(id);
  }
}

class RecordingObjectStorage implements ObjectStorage {
  public readonly deletedKeys: string[] = [];
  async upload(): Promise<void> {}
  async download(): Promise<Buffer> {
    return Buffer.from('');
  }
  async delete(key: string): Promise<void> {
    this.deletedKeys.push(key);
  }
}

class RecordingSearchIndex implements SearchIndex {
  public readonly deletedIds: string[] = [];
  async index(): Promise<void> {}
  async search(): Promise<SearchResult> {
    return { total: 0, items: [] };
  }
  async delete(documentId: string): Promise<void> {
    this.deletedIds.push(documentId);
  }
}

function documentWithFile(): Document {
  const document = Document.create({
    ownerId: 'owner-1',
    title: 'Apuntes',
    subject: 'Mates',
    university: 'US',
    tags: [],
  });
  document.startUpload('documents/x.pdf', 'application/pdf', 10);
  return document;
}

describe('DeleteDocumentUseCase', () => {
  it('deletes the file, the search index entry and the metadata record', async () => {
    const repo = new InMemoryDocumentRepository();
    const storage = new RecordingObjectStorage();
    const searchIndex = new RecordingSearchIndex();
    const document = documentWithFile();
    await repo.save(document);

    await new DeleteDocumentUseCase(repo, storage, searchIndex).execute(document.id);

    expect(repo.has(document.id)).toBe(false);
    expect(storage.deletedKeys).toEqual(['documents/x.pdf']);
    expect(searchIndex.deletedIds).toEqual([document.id]);
  });

  it('skips the storage delete for a document that never had a file uploaded', async () => {
    const repo = new InMemoryDocumentRepository();
    const storage = new RecordingObjectStorage();
    const searchIndex = new RecordingSearchIndex();
    const document = Document.create({
      ownerId: 'owner-1',
      title: 'Apuntes',
      subject: 'Mates',
      university: 'US',
      tags: [],
    });
    await repo.save(document);

    await new DeleteDocumentUseCase(repo, storage, searchIndex).execute(document.id);

    expect(repo.has(document.id)).toBe(false);
    expect(storage.deletedKeys).toEqual([]);
    expect(searchIndex.deletedIds).toEqual([document.id]);
  });

  it('throws DocumentNotFoundError for a document that does not exist', async () => {
    const repo = new InMemoryDocumentRepository();
    const storage = new RecordingObjectStorage();
    const searchIndex = new RecordingSearchIndex();

    await expect(new DeleteDocumentUseCase(repo, storage, searchIndex).execute('missing')).rejects.toThrow(
      DocumentNotFoundError,
    );
  });
});
