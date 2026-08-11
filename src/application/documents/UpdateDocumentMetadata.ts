import type { Document, DocumentProps } from '../../domain/document/Document.js';
import type { DocumentRepository } from './DocumentRepository.js';
import { ConcurrencyConflictError, DocumentNotFoundError } from './errors.js';

export interface UpdateDocumentMetadataCommand {
  documentId: string;
  expectedVersion: number;
  fields: Partial<Pick<DocumentProps, 'title' | 'subject' | 'university' | 'tags'>>;
}

// The optimistic-concurrency scenario from section 13: two clients read the
// same document (same version), both try to update it, and only the one
// whose expectedVersion still matches wins — the other gets a conflict
// instead of silently overwriting the first client's change.
export class UpdateDocumentMetadataUseCase {
  constructor(private readonly documents: DocumentRepository) {}

  async execute(command: UpdateDocumentMetadataCommand): Promise<Document> {
    const document = await this.documents.findById(command.documentId);
    if (!document) {
      throw new DocumentNotFoundError(command.documentId);
    }

    // Fail fast if the client was already looking at a stale version,
    // before attempting a write that would fail the same way anyway.
    if (document.version !== command.expectedVersion) {
      throw new ConcurrencyConflictError(command.documentId, command.expectedVersion);
    }

    document.updateMetadata(command.fields);

    const updated = await this.documents.updateWithVersionCheck(document, command.expectedVersion);
    if (!updated) {
      // Someone else's write landed between our read and our write.
      throw new ConcurrencyConflictError(command.documentId, command.expectedVersion);
    }

    return document;
  }
}
