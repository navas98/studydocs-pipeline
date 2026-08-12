import { describe, expect, it } from 'vitest';
import type { DocumentQueue, ProcessingRequestedMessage } from '../../src/application/documents/DocumentQueue.js';
import type { DocumentRepository } from '../../src/application/documents/DocumentRepository.js';
import { DocumentNotFoundError } from '../../src/application/documents/errors.js';
import { RetryDocumentUseCase } from '../../src/application/documents/RetryDocument.js';
import { InvalidDocumentTransitionError } from '../../src/domain/document/errors.js';
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

  async delete(): Promise<void> {
    throw new Error('not used in this test');
  }
}

class RecordingQueue implements DocumentQueue {
  public readonly published: ProcessingRequestedMessage[] = [];

  async publishProcessingRequested(message: ProcessingRequestedMessage): Promise<void> {
    this.published.push(message);
  }
}

function failedDocument(): Document {
  const document = Document.create({
    ownerId: 'owner-1',
    title: 'Apuntes',
    subject: 'Mates',
    university: 'US',
    tags: [],
  });
  document.startUpload('documents/x.pdf', 'application/pdf', 10);
  document.enqueue();
  document.beginProcessing();
  document.fail('boom');
  return document;
}

describe('RetryDocumentUseCase', () => {
  it('re-queues a FAILED document and publishes a new processing message', async () => {
    const repo = new InMemoryDocumentRepository();
    const queue = new RecordingQueue();
    const document = failedDocument();
    await repo.save(document);

    const useCase = new RetryDocumentUseCase(repo, queue);
    const result = await useCase.execute(document.id);

    expect(result.status).toBe('QUEUED');
    expect(result.processingAttempts).toBe(0);
    expect(queue.published).toHaveLength(1);
    expect(queue.published[0]?.documentId).toBe(document.id);

    const stored = await repo.findById(document.id);
    expect(stored?.status).toBe('QUEUED');
  });

  it('throws DocumentNotFoundError for a document that does not exist', async () => {
    const repo = new InMemoryDocumentRepository();
    const queue = new RecordingQueue();
    const useCase = new RetryDocumentUseCase(repo, queue);

    await expect(useCase.execute('missing')).rejects.toThrow(DocumentNotFoundError);
  });

  it('rejects retrying a document that is not FAILED', async () => {
    const repo = new InMemoryDocumentRepository();
    const queue = new RecordingQueue();
    const document = Document.create({
      ownerId: 'owner-1',
      title: 'Apuntes',
      subject: 'Mates',
      university: 'US',
      tags: [],
    });
    await repo.save(document);

    const useCase = new RetryDocumentUseCase(repo, queue);

    await expect(useCase.execute(document.id)).rejects.toThrow(InvalidDocumentTransitionError);
    expect(queue.published).toHaveLength(0);
  });
});
