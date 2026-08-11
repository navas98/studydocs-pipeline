import type { DocumentProcessor } from './DocumentProcessor.js';
import type { DocumentRepository } from './DocumentRepository.js';
import { PermanentProcessingError } from './processingErrors.js';

export type ProcessDocumentOutcome = 'INDEXED' | 'RETRYING' | 'FAILED' | 'SKIPPED_NOT_FOUND' | 'SKIPPED_ALREADY_TERMINAL';

// SQS delivers at-least-once, so the same documentId can arrive more than
// once. Matches the app's retry budget to the queue's redrive policy
// (maxReceiveCount) configured in infra/localstack/init.sh, so both stay
// in sync instead of tracking two independent retry counters.
const MAX_PROCESSING_ATTEMPTS = 3;

export class ProcessDocumentUseCase {
  constructor(
    private readonly documents: DocumentRepository,
    private readonly processor: DocumentProcessor,
  ) {}

  async execute(documentId: string): Promise<ProcessDocumentOutcome> {
    const document = await this.documents.findById(documentId);
    if (!document) {
      return 'SKIPPED_NOT_FOUND';
    }

    // A duplicate delivery of a message whose document already reached a
    // terminal state: nothing to do, and re-running beginProcessing() would
    // throw (the state machine forbids leaving INDEXED/FAILED).
    if (document.status === 'INDEXED' || document.status === 'FAILED') {
      return 'SKIPPED_ALREADY_TERMINAL';
    }

    document.beginProcessing();
    await this.documents.save(document);

    try {
      await this.processor.process(document);
      document.markIndexed();
      await this.documents.save(document);
      return 'INDEXED';
    } catch (error) {
      const isPermanent = error instanceof PermanentProcessingError;
      const attemptsExhausted = document.processingAttempts >= MAX_PROCESSING_ATTEMPTS;
      const reason = error instanceof Error ? error.message : String(error);

      if (isPermanent || attemptsExhausted) {
        document.fail(reason);
        await this.documents.save(document);
        return 'FAILED';
      }

      document.retry(reason);
      await this.documents.save(document);
      return 'RETRYING';
    }
  }
}
