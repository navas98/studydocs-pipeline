import { randomUUID } from 'node:crypto';
import type { Document } from '../../domain/document/Document.js';
import type { DocumentQueue } from './DocumentQueue.js';
import type { DocumentRepository } from './DocumentRepository.js';
import type { ObjectStorage } from './ObjectStorage.js';
import { DocumentNotFoundError } from './errors.js';

export interface CompleteUploadCommand {
  documentId: string;
  file: Buffer;
  mimeType: string;
  // Propagated from the HTTP request (section 15: correlation id from API
  // through to the worker); falls back to a fresh id for callers that
  // don't have one (e.g. tests, scripts).
  correlationId?: string;
}

// Orchestrates the "PDF stored + processing queued" step from section 4.1
// of the design doc: store the file, move CREATED -> UPLOADING -> QUEUED,
// then publish the processing message. If the publish fails after save,
// the document is stuck in QUEUED with no message in flight — acceptable
// for a 5-day demo, but a real system would need an outbox/reconciliation
// job to close that gap.
export class CompleteUploadUseCase {
  constructor(
    private readonly documents: DocumentRepository,
    private readonly storage: ObjectStorage,
    private readonly queue: DocumentQueue,
  ) {}

  async execute(command: CompleteUploadCommand): Promise<Document> {
    const document = await this.documents.findById(command.documentId);
    if (!document) {
      throw new DocumentNotFoundError(command.documentId);
    }

    const storageKey = `documents/${document.id}.pdf`;
    await this.storage.upload(storageKey, command.file, command.mimeType);

    document.startUpload(storageKey, command.mimeType, command.file.byteLength);
    document.enqueue();
    await this.documents.save(document);

    await this.queue.publishProcessingRequested({
      documentId: document.id,
      correlationId: command.correlationId ?? randomUUID(),
    });

    return document;
  }
}
