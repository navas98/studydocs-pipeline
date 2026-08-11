import { describe, expect, it } from 'vitest';
import type { DocumentRepository } from '../../src/application/documents/DocumentRepository.js';
import { ConcurrencyConflictError, DocumentNotFoundError } from '../../src/application/documents/errors.js';
import { UpdateDocumentMetadataUseCase } from '../../src/application/documents/UpdateDocumentMetadata.js';
import { Document } from '../../src/domain/document/Document.js';

// Stores snapshots (via toProps()/fromProps()), not live Document
// references — mirrors the serialization boundary a real database gives
// you for free. Without this, mutating a Document you already fetched
// would retroactively change what's "in the database" underneath you.
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

  async updateWithVersionCheck(document: Document, expectedVersion: number): Promise<boolean> {
    const stored = this.store.get(document.id);
    if (!stored || stored.version !== expectedVersion) {
      return false;
    }
    this.store.set(document.id, document.toProps());
    return true;
  }
}

function newDocument(): Document {
  return Document.create({
    ownerId: 'owner-1',
    title: 'Apuntes',
    subject: 'Mates',
    university: 'US',
    tags: [],
  });
}

describe('UpdateDocumentMetadataUseCase', () => {
  it('updates the document when expectedVersion matches the current version', async () => {
    const repo = new InMemoryDocumentRepository();
    const document = newDocument();
    await repo.save(document);

    const useCase = new UpdateDocumentMetadataUseCase(repo);
    const updated = await useCase.execute({
      documentId: document.id,
      expectedVersion: 0,
      fields: { title: 'Título nuevo' },
    });

    expect(updated.toProps().title).toBe('Título nuevo');
    expect(updated.version).toBe(1);
  });

  it('throws ConcurrencyConflictError when expectedVersion is stale', async () => {
    const repo = new InMemoryDocumentRepository();
    const document = newDocument();
    await repo.save(document);
    document.updateMetadata({ title: 'Cambio de otro cliente' });
    await repo.save(document); // now at version 1

    const useCase = new UpdateDocumentMetadataUseCase(repo);

    await expect(
      useCase.execute({ documentId: document.id, expectedVersion: 0, fields: { title: 'Mi cambio' } }),
    ).rejects.toThrow(ConcurrencyConflictError);
  });

  it('throws DocumentNotFoundError for a document that does not exist', async () => {
    const repo = new InMemoryDocumentRepository();
    const useCase = new UpdateDocumentMetadataUseCase(repo);

    await expect(
      useCase.execute({ documentId: 'missing', expectedVersion: 0, fields: { title: 'x' } }),
    ).rejects.toThrow(DocumentNotFoundError);
  });

  it('simulates two concurrent clients: the second one to write loses with a conflict', async () => {
    const repo = new InMemoryDocumentRepository();
    const document = newDocument();
    await repo.save(document);

    // Both "clients" read the document at version 0.
    const useCase = new UpdateDocumentMetadataUseCase(repo);

    const clientA = useCase.execute({
      documentId: document.id,
      expectedVersion: 0,
      fields: { title: 'Cambio de A' },
    });
    const resultA = await clientA;
    expect(resultA.toProps().title).toBe('Cambio de A');

    // Client B still believes the version is 0, but A already moved it to 1.
    await expect(
      useCase.execute({
        documentId: document.id,
        expectedVersion: 0,
        fields: { title: 'Cambio de B' },
      }),
    ).rejects.toThrow(ConcurrencyConflictError);

    // A's change is the one that survived — not silently overwritten by B.
    const stored = await repo.findById(document.id);
    expect(stored?.toProps().title).toBe('Cambio de A');
  });
});
