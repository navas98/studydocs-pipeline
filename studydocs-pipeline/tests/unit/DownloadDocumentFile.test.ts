import { describe, expect, it } from 'vitest';
import type { DocumentRepository } from '../../src/application/documents/DocumentRepository.js';
import { DownloadDocumentFileUseCase } from '../../src/application/documents/DownloadDocumentFile.js';
import { DocumentNotFoundError } from '../../src/application/documents/errors.js';
import type { ObjectStorage } from '../../src/application/documents/ObjectStorage.js';
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
}

class FakeObjectStorage implements ObjectStorage {
  constructor(private readonly content: Buffer) {}
  async upload(): Promise<void> {}
  async download(): Promise<Buffer> {
    return this.content;
  }
}

describe('DownloadDocumentFileUseCase', () => {
  it('returns the file content, mime type and a filename derived from the title', async () => {
    const repo = new InMemoryDocumentRepository();
    const document = Document.create({
      ownerId: 'owner-1',
      title: 'Apuntes de Álgebra',
      subject: 'Mates',
      university: 'US',
      tags: [],
    });
    document.startUpload('documents/x.pdf', 'application/pdf', 10);
    await repo.save(document);

    const useCase = new DownloadDocumentFileUseCase(repo, new FakeObjectStorage(Buffer.from('%PDF-1.4')));
    const file = await useCase.execute(document.id);

    expect(file.buffer.toString()).toBe('%PDF-1.4');
    expect(file.mimeType).toBe('application/pdf');
    expect(file.filename).toBe('Apuntes de Álgebra.pdf');
  });

  it('throws DocumentNotFoundError for a document that does not exist', async () => {
    const repo = new InMemoryDocumentRepository();
    const useCase = new DownloadDocumentFileUseCase(repo, new FakeObjectStorage(Buffer.from('')));

    await expect(useCase.execute('missing')).rejects.toThrow(DocumentNotFoundError);
  });

  it('throws DocumentNotFoundError for a document that has no file uploaded yet', async () => {
    const repo = new InMemoryDocumentRepository();
    const document = Document.create({
      ownerId: 'owner-1',
      title: 'Apuntes',
      subject: 'Mates',
      university: 'US',
      tags: [],
    });
    await repo.save(document);

    const useCase = new DownloadDocumentFileUseCase(repo, new FakeObjectStorage(Buffer.from('')));

    await expect(useCase.execute(document.id)).rejects.toThrow(DocumentNotFoundError);
  });
});
