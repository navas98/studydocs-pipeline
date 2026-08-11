import { randomUUID } from 'node:crypto';
import type { Document } from '../../domain/document/Document.js';
import type { DocumentQueue } from './DocumentQueue.js';
import type { DocumentRepository } from './DocumentRepository.js';
import { DocumentNotFoundError } from './errors.js';

// POST /documents/:id/retry (section 9): a controlled manual retry of an
// eligible failure. "Eligible" here just means status === FAILED — the
// domain transition itself enforces that (retryFromFailure() throws
// InvalidDocumentTransitionError otherwise), so this use case doesn't
// duplicate that check.
export class RetryDocumentUseCase {
  constructor(
    private readonly documents: DocumentRepository,
    private readonly queue: DocumentQueue,
  ) {}

  async execute(documentId: string): Promise<Document> {
    const document = await this.documents.findById(documentId);
    if (!document) {
      throw new DocumentNotFoundError(documentId);
    }

    document.retryFromFailure();
    await this.documents.save(document);

    await this.queue.publishProcessingRequested({
      documentId: document.id,
      correlationId: randomUUID(),
    });

    return document;
  }
}
