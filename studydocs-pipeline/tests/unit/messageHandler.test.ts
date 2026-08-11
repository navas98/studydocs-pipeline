import { describe, expect, it } from 'vitest';
import type { Logger } from '../../src/application/Logger.js';
import type { DocumentProcessor } from '../../src/application/documents/DocumentProcessor.js';
import type { DocumentRepository } from '../../src/application/documents/DocumentRepository.js';
import { ProcessDocumentUseCase } from '../../src/application/documents/ProcessDocument.js';
import { TransientProcessingError } from '../../src/application/documents/processingErrors.js';
import { Document } from '../../src/domain/document/Document.js';
import { handleMessage } from '../../src/worker/messageHandler.js';

const noopLogger: Logger = { info: () => {}, error: () => {} };

class InMemoryDocumentRepository implements DocumentRepository {
  private readonly store = new Map<string, Document>();

  async save(document: Document): Promise<void> {
    this.store.set(document.id, document);
  }

  async findById(id: string): Promise<Document | null> {
    return this.store.get(id) ?? null;
  }

  async findByOwner(): Promise<Document[]> {
    return [];
  }
}

function queuedDocument(): Document {
  const document = Document.create({
    ownerId: 'owner-1',
    title: 'Apuntes',
    subject: 'Mates',
    university: 'US',
    tags: [],
  });
  document.startUpload('documents/x.pdf', 'application/pdf', 10);
  document.enqueue();
  return document;
}

describe('handleMessage', () => {
  it('acks a message whose document indexes successfully', async () => {
    const repo = new InMemoryDocumentRepository();
    const document = queuedDocument();
    await repo.save(document);
    const processor: DocumentProcessor = { process: async () => {} };
    const useCase = new ProcessDocumentUseCase(repo, processor, noopLogger);

    const result = await handleMessage(
      useCase,
      JSON.stringify({ documentId: document.id, correlationId: 'c-1' }),
    );

    expect(result).toEqual({ action: 'ack', outcome: 'INDEXED' });
  });

  it('requeues a message when the document is left in RETRYING', async () => {
    const repo = new InMemoryDocumentRepository();
    const document = queuedDocument();
    await repo.save(document);
    const processor: DocumentProcessor = {
      process: async () => {
        throw new TransientProcessingError('boom');
      },
    };
    const useCase = new ProcessDocumentUseCase(repo, processor, noopLogger);

    const result = await handleMessage(
      useCase,
      JSON.stringify({ documentId: document.id, correlationId: 'c-1' }),
    );

    expect(result).toEqual({ action: 'requeue', outcome: 'RETRYING' });
  });

  it('acks a message for a document that no longer exists', async () => {
    const repo = new InMemoryDocumentRepository();
    const processor: DocumentProcessor = { process: async () => {} };
    const useCase = new ProcessDocumentUseCase(repo, processor, noopLogger);

    const result = await handleMessage(
      useCase,
      JSON.stringify({ documentId: 'does-not-exist', correlationId: 'c-1' }),
    );

    expect(result).toEqual({ action: 'ack', outcome: 'SKIPPED_NOT_FOUND' });
  });
});
