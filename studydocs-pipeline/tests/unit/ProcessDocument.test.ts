import { describe, expect, it } from 'vitest';
import type { DocumentProcessor } from '../../src/application/documents/DocumentProcessor.js';
import type { DocumentRepository } from '../../src/application/documents/DocumentRepository.js';
import { ProcessDocumentUseCase } from '../../src/application/documents/ProcessDocument.js';
import { PermanentProcessingError, TransientProcessingError } from '../../src/application/documents/processingErrors.js';
import { Document } from '../../src/domain/document/Document.js';

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

class AlwaysSucceedsProcessor implements DocumentProcessor {
  async process(): Promise<void> {}
}

class AlwaysFailsProcessor implements DocumentProcessor {
  constructor(private readonly error: Error) {}
  async process(): Promise<void> {
    throw this.error;
  }
}

describe('ProcessDocumentUseCase', () => {
  it('indexes a queued document that processes successfully', async () => {
    const repo = new InMemoryDocumentRepository();
    const document = queuedDocument();
    await repo.save(document);

    const useCase = new ProcessDocumentUseCase(repo, new AlwaysSucceedsProcessor());
    const outcome = await useCase.execute(document.id);

    expect(outcome).toBe('INDEXED');
    expect((await repo.findById(document.id))?.status).toBe('INDEXED');
  });

  it('retries on a transient failure while attempts remain', async () => {
    const repo = new InMemoryDocumentRepository();
    const document = queuedDocument();
    await repo.save(document);

    const useCase = new ProcessDocumentUseCase(
      repo,
      new AlwaysFailsProcessor(new TransientProcessingError('S3 timeout')),
    );
    const outcome = await useCase.execute(document.id);

    expect(outcome).toBe('RETRYING');
    const stored = await repo.findById(document.id);
    expect(stored?.status).toBe('RETRYING');
    expect(stored?.processingAttempts).toBe(1);
  });

  it('fails permanently on a permanent error regardless of attempts remaining', async () => {
    const repo = new InMemoryDocumentRepository();
    const document = queuedDocument();
    await repo.save(document);

    const useCase = new ProcessDocumentUseCase(
      repo,
      new AlwaysFailsProcessor(new PermanentProcessingError('not a real PDF')),
    );
    const outcome = await useCase.execute(document.id);

    expect(outcome).toBe('FAILED');
    expect((await repo.findById(document.id))?.status).toBe('FAILED');
  });

  it('fails once the transient retry budget is exhausted', async () => {
    const repo = new InMemoryDocumentRepository();
    const document = queuedDocument();
    await repo.save(document);

    const useCase = new ProcessDocumentUseCase(
      repo,
      new AlwaysFailsProcessor(new TransientProcessingError('S3 timeout')),
    );

    await useCase.execute(document.id); // attempt 1 -> RETRYING
    await useCase.execute(document.id); // attempt 2 -> RETRYING
    const outcome = await useCase.execute(document.id); // attempt 3 -> FAILED

    expect(outcome).toBe('FAILED');
    expect((await repo.findById(document.id))?.processingAttempts).toBe(3);
  });

  it('is idempotent: a duplicate message for an already-INDEXED document is a no-op', async () => {
    const repo = new InMemoryDocumentRepository();
    const document = queuedDocument();
    document.beginProcessing();
    document.markIndexed();
    await repo.save(document);

    const processor = new AlwaysSucceedsProcessor();
    const useCase = new ProcessDocumentUseCase(repo, processor);
    const outcome = await useCase.execute(document.id);

    expect(outcome).toBe('SKIPPED_ALREADY_TERMINAL');
    expect((await repo.findById(document.id))?.version).toBe(document.version);
  });

  it('is idempotent: a duplicate message for an already-FAILED document is a no-op', async () => {
    const repo = new InMemoryDocumentRepository();
    const document = queuedDocument();
    document.beginProcessing();
    document.fail('boom');
    await repo.save(document);

    const useCase = new ProcessDocumentUseCase(repo, new AlwaysSucceedsProcessor());
    const outcome = await useCase.execute(document.id);

    expect(outcome).toBe('SKIPPED_ALREADY_TERMINAL');
  });

  it('skips a message pointing at a document that no longer exists', async () => {
    const repo = new InMemoryDocumentRepository();
    const useCase = new ProcessDocumentUseCase(repo, new AlwaysSucceedsProcessor());

    const outcome = await useCase.execute('does-not-exist');

    expect(outcome).toBe('SKIPPED_NOT_FOUND');
  });
});
